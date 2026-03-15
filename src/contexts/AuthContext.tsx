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

  const loadSalon = useCallback(async (u: User): Promise<Salon | null> => {
    console.log('[Auth] loadSalon called for user:', u.id);

    // 1. Salon owned by user
    const { data: owned, error: ownedErr } = await supabase
      .from('salons')
      .select('id, name, owner_id, business_hours')
      .eq('owner_id', u.id)
      .limit(1)
      .maybeSingle();

    console.log('[Auth] owned query:', { owned: !!owned, error: ownedErr?.message });

    if (owned) return owned;

    // 2. Any salon visible via RLS
    const { data: visible, error: visibleErr } = await supabase
      .from('salons')
      .select('id, name, owner_id, business_hours')
      .limit(1)
      .maybeSingle();

    console.log('[Auth] visible query:', { visible: !!visible, error: visibleErr?.message });

    if (visible) return visible;

    // 3. Auto-create for new user
    console.log('[Auth] No salon found, auto-creating...');
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

    console.log('[Auth] create result:', { created: !!created, error: createErr?.message });

    return created ?? null;
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    // Clean up OAuth code from URL
    if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
      console.log('[Auth] Cleaned code= from URL');
    }

    const initialize = async () => {
      console.log('[Auth] === INITIALIZING ===');

      try {
        // Step 1: Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log('[Auth] getSession:', {
          hasSession: !!session,
          hasUser: !!session?.user,
          email: session?.user?.email,
          error: sessionError?.message,
        });

        if (!session?.user) {
          // Step 1b: Try getUser() as fallback (validates server-side, can refresh token)
          console.log('[Auth] No session, trying getUser()...');
          const { data: { user: validUser }, error: userError } = await supabase.auth.getUser();
          console.log('[Auth] getUser:', {
            hasUser: !!validUser,
            email: validUser?.email,
            error: userError?.message,
          });

          if (!validUser) {
            console.log('[Auth] No user found, setting loading=false');
            if (!cancelled) {
              setUser(null);
              setSalon(null);
              setLoading(false);
            }
            return;
          }

          // getUser() found a user even though getSession() didn't
          if (!cancelled) {
            setUser(validUser);
            const s = await loadSalon(validUser);
            if (!cancelled) {
              setSalon(s);
              setLoading(false);
              console.log('[Auth] Loaded via getUser fallback, salon:', s?.name);
            }
          }
          return;
        }

        // Step 2: We have a session, load salon
        if (!cancelled) {
          setUser(session.user);
          const s = await loadSalon(session.user);
          if (!cancelled) {
            setSalon(s);
            setLoading(false);
            console.log('[Auth] Loaded via getSession, salon:', s?.name);
          }
        }
      } catch (err) {
        console.error('[Auth] Initialize error:', err);
        if (!cancelled) setLoading(false);
      }
    };

    // Run init
    initialize();

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, session: { user: User | null } | null) => {
        if (cancelled) return;
        console.log('[Auth] onAuthStateChange:', event, { hasUser: !!session?.user });

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSalon(null);
          setLoading(false);
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          const s = await loadSalon(session.user);
          if (!cancelled) {
            setSalon(s);
            setLoading(false);
            console.log('[Auth] SIGNED_IN loaded salon:', s?.name);
          }
        }

        // TOKEN_REFRESHED: update user, retry salon if needed
        if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user);
          if (!salon) {
            const s = await loadSalon(session.user);
            if (!cancelled) {
              setSalon(s);
              console.log('[Auth] TOKEN_REFRESHED loaded salon:', s?.name);
            }
          }
        }
      }
    );

    // Safety timeout — only fires if nothing resolved in 10s
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
