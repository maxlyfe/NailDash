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
  const salonLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const fetchSalon = async (u: User) => {
      if (fetchingRef.current || salonLoadedRef.current) return;
      fetchingRef.current = true;
      try {
        // Try to find salon owned by this user
        const { data: owned } = await supabase
          .from('salons')
          .select('id, name, owner_id, business_hours')
          .eq('owner_id', u.id)
          .limit(1)
          .maybeSingle();

        if (cancelled) { fetchingRef.current = false; return; }
        if (owned) { setSalon(owned); salonLoadedRef.current = true; fetchingRef.current = false; return; }

        // Fallback: any salon visible via RLS (e.g. staff member)
        const { data: visible } = await supabase
          .from('salons')
          .select('id, name, owner_id, business_hours')
          .limit(1)
          .maybeSingle();

        if (cancelled) { fetchingRef.current = false; return; }
        if (visible) { setSalon(visible); salonLoadedRef.current = true; fetchingRef.current = false; return; }

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

        if (cancelled) { fetchingRef.current = false; return; }
        if (created && !createErr) {
          setSalon(created);
          salonLoadedRef.current = true;
        } else {
          console.error('Failed to create salon:', createErr?.message);
          salonLoadedRef.current = true; // Mark as attempted to avoid infinite retry
        }
      } catch (err) {
        console.error('fetchSalon error:', err);
        salonLoadedRef.current = true;
      } finally {
        fetchingRef.current = false;
      }
    };

    // onAuthStateChange fires INITIAL_SESSION immediately (sync) with current session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (cancelled) return;

        const sessionUser = session?.user ?? null;
        setUser(sessionUser);

        if (!sessionUser) {
          setSalon(null);
          salonLoadedRef.current = false;
          fetchingRef.current = false;
          // Don't stop loading if OAuth code exchange is pending
          if (event === 'INITIAL_SESSION' && typeof window !== 'undefined' && window.location.search.includes('code=')) {
            // PKCE flow: code will be exchanged, then SIGNED_IN fires
            return;
          }
          setLoading(false);
          return;
        }

        // Fetch salon on initial load and new sign-in
        if (event === 'SIGNED_IN') {
          salonLoadedRef.current = false;
          fetchingRef.current = false;
        }
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          await fetchSalon(sessionUser);
          if (!cancelled) setLoading(false);
        }
      }
    );

    // Safety timeout — if nothing fires in 15 seconds, stop loading
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 15000);

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
    salonLoadedRef.current = false;
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
