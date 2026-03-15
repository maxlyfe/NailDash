'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/contexts/LanguageContext';

/**
 * Bridge component: syncs the salon's DB locale into the LanguageContext.
 * Placed inside AuthProvider so it can access useAuth().
 */
export function LocaleSync() {
  const { salon } = useAuth();
  const { syncFromSalon } = useT();
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (salon && salon.id !== syncedRef.current) {
      syncedRef.current = salon.id;
      syncFromSalon(salon.id, salon.locale);
    }
  }, [salon, syncFromSalon]);

  return null;
}
