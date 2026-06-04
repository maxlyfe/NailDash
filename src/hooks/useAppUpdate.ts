'use client';

import { useEffect, useState } from 'react';

export type UpdateManifest = {
  latestVersion: string;
  url: string;
  notes?: string;
  minVersion?: string;
  forceUpdate?: boolean;
};

/** Compara versões semver simples: retorna true se a > b. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * Verifica, a cada abertura do APK, se há uma versão mais nova publicada.
 * Só roda em plataforma nativa (Capacitor). No navegador não faz nada.
 */
export function useAppUpdate() {
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        const version = info.version || '0.0.0';

        const res = await fetch(
          `https://naildash.netlify.app/update-manifest.json?t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data: UpdateManifest = await res.json();

        if (cancelled) return;

        const available = isNewer(data.latestVersion, version);
        const mustForce =
          !!data.forceUpdate ||
          (!!data.minVersion && isNewer(data.minVersion, version));

        setCurrentVersion(version);
        setManifest(data);
        setUpdateAvailable(available);
        setForceUpdate(available && mustForce);
      } catch {
        // ambiente sem Capacitor ou rede indisponível — ignora
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { manifest, currentVersion, updateAvailable, forceUpdate };
}
