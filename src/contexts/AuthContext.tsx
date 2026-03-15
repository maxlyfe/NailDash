'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

type BusinessHours = Record<string, { open: string; close: string } | null>;

type Salon = {
  id: string;
  name: string;
  owner_id: string;
  business_hours: BusinessHours | null;
};

type AuthContextType = {
  user: User | null;
  salon: Salon | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  salon: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [salon, setSalon] = useState<Salon | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const fetchingRef = useRef(false);
  const salonFoundRef = useRef(false); // Only true when salon was successfully loaded

  useEffect(() => {
    let cancelled = false;

    const fetchSalon = async (u: User): Promise<boolean> => {
      if (fetchingRef.current) return salonFoundRef.current;
      if (salonFoundRef.current) return true;
      fetchingRef.current = true;

      try {
        // Try to find salon owned by this user
        const { data: owned, error: ownedErr } = await supabase
          .from('salons')
          .select('id, name, owner_id, business_hours')
          .eq('owner_id', u.id)
          .limit(1)
          .maybeSingle();

        if (cancelled) { fetchingRef.current = false; return false; }

        // If query failed (auth error, RLS), DON'T mark as loaded — allow retry after token refresh
        if (ownedErr) {
          console.warn('fetchSalon owned query error:', ownedErr.message);
          fetchingRef.current = false;
          return false;
        }

        if (owned) {
          setSalon(owned);
          salonFoundRef.current = true;
          fetchingRef.current = false;
          return true;
        }

        // Fallback: any salon visible via RLS (e.g. staff member)
        const { data: visible, error: visibleErr } = await supabase
          .from('salons')
          .select('id, name, owner_id, business_hours')
          .limit(1)
          .maybeSingle();

        if (cancelled) { fetchingRef.current = false; return false; }
        if (visibleErr) {
          console.warn('fetchSalon visible query error:', visibleErr.message);
          fetchingRef.current = false;
          return false;
        }

        if (visible) {
          setSalon(visible);
          salonFoundRef.current = true;
          fetchingRef.current = false;
          return true;
        }

        // No salon found — auto-create for new user
        const displayName = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Meu Salão';
        const { data: created, error: createErr } = await supabase
          .from('salons')
          .insert({
            owner_id: u.id,
            name: `Salão de ${displayName}`,
            business_hours: {
              segunda: { open: '08:00', close: '18:00' },
              terca: { open: '08:00', close: '18:00' },
              quarta: { open: '08:00', close: '18:00' },
              quinta: { open: '08:00', close: '18:00' },
              sexta: { open: '08:00', close: '18:00' },
              sabado: { open: '08:00', close: '14:00' },
              domingo: null,
            },
          })
          .select('id, name, owner_id, business_hours')
          .single();

        if (cancelled) { fetchingRef.current = false; return false; }
        if (created && !createErr) {
          setSalon(created);
          salonFoundRef.current = true;
          fetchingRef.current = false;
          return true;
        }

        console.error('Failed to create salon:', createErr?.message);
        // DON'T mark as loaded on failure — allow retry after TOKEN_REFRESHED
        fetchingRef.current = false;
        return false;
      } catch (err) {
        console.error('fetchSalon error:', err);
        fetchingRef.current = false;
        return false;
      }
    };

    // Step 1: Validate session with getUser() (forces server-side token check + refresh)
    const init = async () => {
      try {
        const { data: { user: validUser }, error } = await supabase.auth.getUser();

        if (cancelled) return;

        if (error || !validUser) {
          // No valid session — stop loading, user will be redirected by middleware
          setUser(null);
          setSalon(null);
          setLoading(false);
          return;
        }

        setUser(validUser);
        await fetchSalon(validUser);
        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error('Auth init error:', err);
        if (!cancelled) setLoading(false);
      }
    };

    init();

    // Step 2: Listen for auth changes (SIGNED_IN after OAuth, TOKEN_REFRESHED for session renewal)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (cancelled) return;

        const sessionUser = session?.user ?? null;

        if (!sessionUser) {
          setUser(null);
          setSalon(null);
          salonFoundRef.current = false;
          fetchingRef.current = false;
          // Don't stop loading if OAuth code exchange is pending
          if (event === 'INITIAL_SESSION' && typeof window !== 'undefined' && window.location.search.includes('code=')) {
            return;
          }
          setLoading(false);
          return;
        }

        setUser(sessionUser);

        // On SIGNED_IN (fresh login), always retry salon fetch
        if (event === 'SIGNED_IN') {
          salonFoundRef.current = false;
          fetchingRef.current = false;
          await fetchSalon(sessionUser);
          if (!cancelled) setLoading(false);
        }

        // On TOKEN_REFRESHED, retry salon fetch if it failed previously
        if (event === 'TOKEN_REFRESHED' && !salonFoundRef.current) {
          fetchingRef.current = false;
          await fetchSalon(sessionUser);
          if (!cancelled) setLoading(false);
        }
      }
    );

    // Safety timeout — if nothing resolves in 10 seconds, stop loading
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
    setUser(null);
    setSalon(null);
    salonFoundRef.current = false;
    fetchingRef.current = false;
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, salon, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
