'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

type BusinessHours = Record<string, { open: string; close: string } | null>;

type Salon = {
  id: string;
  name: string;
  owner_id: string;
  business_hours: BusinessHours | null;
  locale: string | null;
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
  const [authReady, setAuthReady] = useState(false);

  const supabase = createClient();

  // Effect 1: Resolve auth state (user) — NO heavy async work
  useEffect(() => {
    // Clean up OAuth code from URL
    if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
      console.log('[Auth] Cleaned code= from URL');
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, session: { user: User | null } | null) => {
        console.log('[Auth] onAuthStateChange:', event, { hasUser: !!session?.user });

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSalon(null);
          setAuthReady(true);
          return;
        }

        // For INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED — just set the user
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        setAuthReady(true);
      }
    );

    // Safety: if onAuthStateChange never fires
    const timeout = setTimeout(() => {
      setAuthReady(true);
    }, 5000);

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Load salon AFTER user is resolved — separate from auth state machine
  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      setSalon(null);
      setLoading(false);
      console.log('[Auth] No user, loading=false');
      return;
    }

    let cancelled = false;

    const loadSalon = async () => {
      console.log('[Auth] loadSalon for:', user.id);

      try {
        // 1. Salon owned by user
        const { data: owned, error: ownedErr } = await supabase
          .from('salons')
          .select('id, name, owner_id, business_hours, locale')
          .eq('owner_id', user.id)
          .limit(1)
          .maybeSingle();

        console.log('[Auth] owned query:', { found: !!owned, error: ownedErr?.message });

        if (cancelled) return;

        if (owned) {
          setSalon(owned);
          setLoading(false);
          return;
        }

        // 2. Any salon visible via RLS
        const { data: visible, error: visibleErr } = await supabase
          .from('salons')
          .select('id, name, owner_id, business_hours, locale')
          .limit(1)
          .maybeSingle();

        console.log('[Auth] visible query:', { found: !!visible, error: visibleErr?.message });

        if (cancelled) return;

        if (visible) {
          setSalon(visible);
          setLoading(false);
          return;
        }

        // 3. Auto-create for new user
        console.log('[Auth] Auto-creating salon...');
        const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Meu Salão';
        const { data: created, error: createErr } = await supabase
          .from('salons')
          .insert({
            owner_id: user.id,
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
          .select('id, name, owner_id, business_hours, locale')
          .single();

        console.log('[Auth] create result:', { created: !!created, error: createErr?.message });

        if (cancelled) return;
        setSalon(created ?? null);
        setLoading(false);
      } catch (err) {
        console.error('[Auth] loadSalon error:', err);
        if (!cancelled) setLoading(false);
      }
    };

    loadSalon();

    return () => { cancelled = true; };
  }, [authReady, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Auth] Sign out error:', err);
    }
    setUser(null);
    setSalon(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, salon, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
