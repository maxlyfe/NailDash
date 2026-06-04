'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppUpdateModal from '@/components/AppUpdateModal';

/**
 * Ponte nativa do APK (Capacitor). Só age em plataforma nativa.
 *
 * 1. Login Google: quando o Custom Tab retorna via deep link
 *    `com.naildash.pdv://login-callback?code=...`, fecha o browser, troca o
 *    code por sessão (PKCE — grava nos cookies do @supabase/ssr) e navega
 *    para o dashboard. Plano B: se a troca client-side falhar, delega para o
 *    route handler /auth/callback (server-side).
 * 2. Monta o modal de atualização (AppUpdateModal).
 *
 * No navegador comum este componente não faz nada.
 */
export default function NativeBridge() {
  useEffect(() => {
    let urlHandle: { remove: () => void } | null = null;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { App } = await import('@capacitor/app');
        const { Browser } = await import('@capacitor/browser');

        urlHandle = await App.addListener('appUrlOpen', async ({ url }) => {
          if (!url.includes('login-callback')) return;

          await Browser.close().catch(() => {});

          try {
            const urlObj = new URL(url);

            const oauthErr = urlObj.searchParams.get('error');
            if (oauthErr) {
              const desc = urlObj.searchParams.get('error_description') || oauthErr;
              console.error('[NativeBridge] OAuth error:', desc);
              window.location.href = '/login?error=oauth';
              return;
            }

            const code = urlObj.searchParams.get('code');
            if (!code) {
              window.location.href = '/login?error=no_code';
              return;
            }

            const supabase = createClient();
            const { error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
              // Plano B: deixa o route handler server-side trocar o code.
              console.error('[NativeBridge] exchange failed, fallback:', error.message);
              window.location.href = `/auth/callback?code=${encodeURIComponent(code)}`;
              return;
            }

            window.location.href = '/dashboard';
          } catch (err) {
            console.error('[NativeBridge] appUrlOpen error:', err);
            window.location.href = '/login?error=oauth';
          }
        });
      } catch {
        // ambiente sem Capacitor — ignora
      }
    })();

    return () => {
      urlHandle?.remove();
    };
  }, []);

  return <AppUpdateModal />;
}
