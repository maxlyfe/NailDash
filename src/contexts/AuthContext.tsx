'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      if (session?.user) {
        // Fetch user's salon (try by owner first, then by membership)
        const { data: owned } = await supabase
          .from('salons')
          .select('id, name, owner_id, business_hours')
          .eq('owner_id', session.user.id)
          .limit(1)
          .single();
        if (owned) {
          setSalon(owned);
        } else {
          // Fallback: any salon visible via RLS
          const { data: any } = await supabase
            .from('salons')
            .select('id, name, owner_id, business_hours')
            .limit(1)
            .single();
          setSalon(any);
        }
      }
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const { data: owned } = await supabase
            .from('salons')
            .select('id, name, owner_id, business_hours')
            .eq('owner_id', session.user.id)
            .limit(1)
            .single();
          if (owned) {
            setSalon(owned);
          } else {
            const { data: any } = await supabase
              .from('salons')
              .select('id, name, owner_id, business_hours')
              .limit(1)
              .single();
            setSalon(any);
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