'use client';

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { ptBR, esAR } from '@/lib/i18n';
import type { Translations } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/client';

export type Locale = 'pt-BR' | 'es-AR';

type LanguageContextType = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translations;
  /** Called once when salon loads to sync DB locale into the context */
  syncFromSalon: (salonId: string, dbLocale: string | null) => void;
};

const dictionaries: Record<Locale, Translations> = {
  'pt-BR': ptBR,
  'es-AR': esAR,
};

const VALID_LOCALES: Locale[] = ['pt-BR', 'es-AR'];

export const localeOptions: { value: Locale; label: string }[] = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'es-AR', label: 'Español (Argentina)' },
];

const LanguageContext = createContext<LanguageContextType>({
  locale: 'pt-BR',
  setLocale: () => {},
  t: ptBR,
  syncFromSalon: () => {},
});

function toLocale(val: string | null | undefined): Locale {
  if (val && VALID_LOCALES.includes(val as Locale)) return val as Locale;
  return 'pt-BR';
}

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'pt-BR';
  return toLocale(localStorage.getItem('naildash_locale'));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const salonIdRef = useRef<string | null>(null);

  // Called by the dashboard layout once salon is loaded
  const syncFromSalon = (salonId: string, dbLocale: string | null) => {
    salonIdRef.current = salonId;
    const resolved = toLocale(dbLocale);
    setLocaleState(resolved);
    localStorage.setItem('naildash_locale', resolved);
  };

  // User changes locale: update state + localStorage + DB
  const setLocale = async (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('naildash_locale', l);

    if (salonIdRef.current) {
      const supabase = createClient();
      await supabase
        .from('salons')
        .update({ locale: l })
        .eq('id', salonIdRef.current);
    }
  };

  const t = dictionaries[locale];

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, syncFromSalon }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useT = () => useContext(LanguageContext);
