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
    const fetchOrCreateSalon = async (u: User) => {
      // Prevent concurrent calls
      if (fetchingRef.current) return;
      // If we already loaded salon for this user, skip
      if (salonLoadedRef.current) return;

      fetchingRef.current = true;
      try {
        // Try to find salon owned by this user
        const { data: owned, error: ownedErr } = await supabase
          .from('salons')
          .select('id, name, owner_id, business_hours')
          .eq('owner_id', u.id)
          .limit(1)
          .single();

        if (owned && !ownedErr) {
          setSalon(owned);
          salonLoadedRef.current = true;
          return;
        }

        // Fallback: any salon visible via RLS
        const { data: visible, error: visibleErr } = await supabase
          .from('salons')
          .select('id, name, owner_id, business_hours')
          .limit(1)
          .single();

        if (visible && !visibleErr) {
          setSalon(visible);
          salonLoadedRef.current = true;
          return;
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

        if (created && !createErr) {
          setSalon(created);
          salonLoadedRef.current = true;
        } else {
          console.error('Failed to create salon:', createErr?.message);
          // Mark as loaded to prevent infinite retries
          salonLoadedRef.current = true;
        }
      } catch (err) {
        console.error('fetchOrCreateSalon error:', err);
        salonLoadedRef.current = true;
      } finally {
        fetchingRef.current = false;
      }
    };

    let initialized = false;

    const init = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setUser(currentUser);
        if (currentUser) {
          await fetchOrCreateSalon(currentUser);
        }
      } catch (err) {
        console.error('Auth init error:', err);
      } finally {
        initialized = true;
        setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);

        if (!sessionUser) {
          setSalon(null);
          salonLoadedRef.current = false;
          return;
        }

        // Only fetch salon on actual sign-in, not token refresh
        if (event === 'SIGNED_IN') {
          salonLoadedRef.current = false; // Reset for new sign-in
          await fetchOrCreateSalon(sessionUser);
          // If init hasn't finished yet, don't touch loading
          if (!initialized) return;
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
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
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, salon, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
