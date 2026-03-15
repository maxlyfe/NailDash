'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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

  useEffect(() => {
    const fetchOrCreateSalon = async (u: User) => {
      // Try to find salon owned by this user
      const { data: owned } = await supabase
        .from('salons')
        .select('id, name, owner_id, business_hours')
        .eq('owner_id', u.id)
        .limit(1)
        .single();
      if (owned) {
        setSalon(owned);
        return;
      }

      // Fallback: any salon visible via RLS
      const { data: visible } = await supabase
        .from('salons')
        .select('id, name, owner_id, business_hours')
        .limit(1)
        .single();
      if (visible) {
        setSalon(visible);
        return;
      }

      // No salon found — auto-create for new user
      const displayName = u.user_metadata?.full_name || u.email?.split('@')[0] || 'Meu Salão';
      const { data: created } = await supabase
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
      if (created) {
        setSalon(created);
      }
    };

    const init = async () => {
      // getUser() validates token server-side and triggers refresh if needed
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);
      if (currentUser) {
        await fetchOrCreateSalon(currentUser);
      }
      setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser) {
          // Only re-fetch salon on sign-in (not on every token refresh)
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            await fetchOrCreateSalon(sessionUser);
          }
        } else {
          setSalon(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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