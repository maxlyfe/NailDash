'use client';

import { useState } from 'react';
import { Sparkles, Download, X } from 'lucide-react';
import { useAppUpdate } from '@/hooks/useAppUpdate';

/**
 * Modal de atualização do APK. Aparece quando o update-manifest.json indica
 * uma versão mais nova que a instalada. Se forceUpdate, não pode ser fechado.
 * Só renderiza algo em plataforma nativa (o hook só dispara no APK).
 */
export default function AppUpdateModal() {
  const { manifest, updateAvailable, forceUpdate, currentVersion } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!updateAvailable || !manifest || (dismissed && !forceUpdate)) return null;

  const handleUpdate = async () => {
    try {
      const { Browser } = await import('@capacitor/browser');
      const downloadUrl = manifest.url.startsWith('http')
        ? manifest.url
        : `https://naildash.netlify.app${manifest.url}`;
      await Browser.open({ url: downloadUrl });
    } catch {
      window.location.href = manifest.url;
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-5 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-soft-lg border border-nd-border/40 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="relative px-6 py-7 text-center bg-gradient-to-br from-nd-accent/10 to-nd-highlight/10 border-b border-nd-border/30">
          {!forceUpdate && (
            <button
              onClick={() => setDismissed(true)}
              className="absolute top-3 right-3 p-1.5 rounded-full text-nd-muted hover:bg-black/5 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-nd-accent to-nd-highlight mb-3 shadow-soft">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="font-display text-lg font-bold text-nd-heading">
            Atualização disponível
          </h2>
          <p className="text-xs text-nd-muted mt-1">
            Versão {manifest.latestVersion}
            {currentVersion ? ` · instalada ${currentVersion}` : ''}
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {manifest.notes && (
            <p className="text-sm text-nd-text leading-relaxed">{manifest.notes}</p>
          )}

          <button
            onClick={handleUpdate}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5
                       bg-nd-heading text-white font-semibold text-sm rounded-xl
                       transition-all duration-200 hover:bg-nd-text hover:shadow-soft-lg
                       active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            Atualizar agora
          </button>

          {!forceUpdate && (
            <button
              onClick={() => setDismissed(true)}
              className="w-full text-center text-xs text-nd-muted hover:text-nd-text transition-colors"
            >
              Mais tarde
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
