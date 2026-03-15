'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ptBR, esAR } from '@/lib/i18n';
import type { Translations, TranslationKeys } from '@/lib/i18n';

type Locale = 'pt-BR' | 'es-AR';

type LanguageContextType = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translations;
};

const dictionaries: Record<Locale, Translations> = {
  'pt-BR': ptBR,
  'es-AR': esAR,
};

export const localeOptions: { value: Locale; label: string }[] = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'es-AR', label: 'Español (Argentina)' },
];

const LanguageContext = createContext<LanguageContextType>({
  locale: 'pt-BR',
  setLocale: () => {},
  t: ptBR,
});

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'pt-BR';
  const stored = localStorage.getItem('naildash_locale');
  if (stored === 'es-AR') return 'es-AR';
  return 'pt-BR';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('pt-BR');

  useEffect(() => {
    setLocaleState(getStoredLocale());
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('naildash_locale', l);
  };

  const t = dictionaries[locale];

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useT = () => useContext(LanguageContext);
