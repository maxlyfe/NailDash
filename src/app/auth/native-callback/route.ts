import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Bridge OAuth para o APK Android (Capacitor).
 *
 * O Chrome Custom Tab BLOQUEIA redirect 302 direto para schemes custom
 * (com.naildash.pdv://...). Então o Supabase redireciona para ESTA página
 * HTTPS, que re-redireciona via JS — usando um Android Intent URL — para o
 * deep link `com.naildash.pdv://login-callback?code=...`, que o app captura
 * em `appUrlOpen` e troca por uma sessão (PKCE).
 *
 * No navegador normal (não-APK) esta rota não é usada — o fluxo web continua
 * passando por /auth/callback.
 */
const SCHEME = 'com.naildash.pdv';
const FALLBACK_URL = 'https://naildash.netlify.app/login?oauth_fallback=1';

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Retornando ao NailDash…</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Poppins", sans-serif;
      background: #FDF8F3; color: #2A2320;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 1.25rem; padding: 2rem; text-align: center;
    }
    .spinner {
      width: 48px; height: 48px;
      border: 3px solid rgba(212,117,106,0.18); border-top-color: #D4756A;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { margin: 0; }
    .title { font-size: 15px; opacity: 0.85; font-weight: 600; }
    .hint  { font-size: 12px; color: #9B8E84; max-width: 320px; line-height: 1.5; }
    .btn {
      display: none; margin-top: 1rem; padding: 0.85rem 1.75rem;
      background: #D4756A; color: #fff; border: none; border-radius: 999px;
      font-weight: 700; font-size: 14px; cursor: pointer; text-decoration: none;
      box-shadow: 0 4px 16px rgba(212,117,106,0.25);
    }
  </style>
  <script>
    (function() {
      try {
        var url      = new URL(window.location.href);
        var code     = url.searchParams.get('code');
        var oauthErr = url.searchParams.get('error');
        var errDesc  = url.searchParams.get('error_description');
        var hashFrag = url.hash;

        var query = new URLSearchParams();
        if (code) query.set('code', code);
        if (oauthErr) { query.set('error', oauthErr); if (errDesc) query.set('error_description', errDesc); }
        var queryStr = query.toString();

        // Estratégia 1: Android Intent URL (mais confiável a partir de um Custom Tab)
        var intentUrl = 'intent://login-callback';
        if (queryStr) intentUrl += '?' + queryStr;
        if (hashFrag) intentUrl += hashFrag;
        intentUrl += '#Intent;scheme=${SCHEME};package=${SCHEME};' +
          'S.browser_fallback_url=' + encodeURIComponent('${FALLBACK_URL}') + ';end';

        // Estratégia 2: custom scheme (fallback)
        var customSchemeUrl = '${SCHEME}://login-callback';
        if (queryStr) customSchemeUrl += '?' + queryStr;
        if (hashFrag) customSchemeUrl += hashFrag;

        var ua = navigator.userAgent || '';
        var isChromium = /Chrome|CriOS|Chromium/.test(ua) && !/Edge|EdgA|EdgiOS/.test(ua);
        var primary   = isChromium ? intentUrl : customSchemeUrl;
        var secondary = isChromium ? customSchemeUrl : intentUrl;

        try { window.location.replace(primary); }
        catch (e) { setTimeout(function(){ window.location.replace(secondary); }, 100); }

        setTimeout(function() {
          if (document.visibilityState === 'visible') {
            try { window.location.replace(secondary); } catch (e) {}
          }
        }, 1000);

        setTimeout(function() {
          if (document.visibilityState !== 'visible') return;
          var b1 = document.getElementById('btn-intent');
          var b2 = document.getElementById('btn-scheme');
          if (b1) { b1.style.display = 'inline-block'; b1.href = intentUrl; }
          if (b2) { b2.style.display = 'inline-block'; b2.href = customSchemeUrl; }
          var h = document.getElementById('hint');
          if (h) h.textContent = 'Não conseguimos abrir o aplicativo automaticamente. Toque abaixo:';
        }, 2500);
      } catch (e) {
        document.addEventListener('DOMContentLoaded', function() {
          var h = document.getElementById('hint');
          if (h) h.textContent = 'Erro: ' + (e && e.message ? e.message : 'desconhecido');
        });
      }
    })();
  </script>
</head>
<body>
  <div class="spinner"></div>
  <p class="title">Retornando ao aplicativo…</p>
  <p class="hint" id="hint">Aguarde alguns segundos…</p>
  <a id="btn-intent" class="btn" href="#">Abrir NailDash</a>
  <a id="btn-scheme" class="btn" href="#" style="background:rgba(212,117,106,0.12); color:#D4756A;">Tentar outro método</a>
</body>
</html>`;

export async function GET() {
  return new NextResponse(HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
