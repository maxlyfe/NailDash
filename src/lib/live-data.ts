'use client';

import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Keeps every mounted screen showing live numbers without a manual refresh.
 *
 * Three layers, so a stale value can't survive any of them:
 *  1. In-app bus  — a write on any screen instantly recalculates all the others.
 *  2. BroadcastChannel — same, across other tabs of the same browser.
 *  3. Supabase realtime — changes made on another device/phone.
 *  4. focus/visibility — a catch-all refetch when the user comes back to the tab.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
const BUS_NAME = 'naildash-data';

let bus: BroadcastChannel | null = null;
let busReady = false;

function getBus(): BroadcastChannel | null {
  if (busReady) return bus;
  busReady = true;
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  bus = new BroadcastChannel(BUS_NAME);
  bus.onmessage = () => { listeners.forEach(fn => fn()); };
  return bus;
}

/**
 * Announce that data changed. Call right after any write (advance, checkout,
 * cancellation, expense…) so every screen recalculates on the spot.
 */
export function emitDataChange(): void {
  listeners.forEach(fn => fn());
  getBus()?.postMessage('changed');
}

/**
 * Subscribes `refetch` to every change signal.
 *
 * `refetch` is read through a ref, so passing a fresh closure each render (the
 * usual useCallback that depends on the selected month) never re-subscribes.
 */
export function useLiveData(
  supabase: SupabaseClient,
  salonId: string | undefined | null,
  tables: string[],
  refetch: () => void,
): void {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const tableKey = tables.join(',');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    // A single handler may write several rows; debounce so we refetch once.
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refetchRef.current(), 180);
    };

    listeners.add(trigger);
    getBus();

    const onWake = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') trigger();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);

    let channel: ReturnType<SupabaseClient['channel']> | null = null;
    if (salonId) {
      channel = supabase.channel(`live:${salonId}:${tableKey}`);
      for (const table of tableKey.split(',')) {
        channel.on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table, filter: `salon_id=eq.${salonId}` },
          trigger,
        );
      }
      channel.subscribe();
    }

    return () => {
      listeners.delete(trigger);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, salonId, tableKey]);
}
