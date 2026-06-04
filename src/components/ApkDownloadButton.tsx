'use client';

import { useEffect, useState } from 'react';
import { Smartphone, Download } from 'lucide-react';
import { useT } from '@/contexts/LanguageContext';

const APK_URL = '/downloads/NailDash.apk';

const TXT = {
  'pt-BR': {
    title: 'Aplicativo Android',
    subtitle: 'Baixe o app NailDash para instalar no seu celular Android.',
    download: 'Baixar APK',
    loginCta: 'Baixar app para Android',
  },
  'es-AR': {
    title: 'Aplicación Android',
    subtitle: 'Descargá la app NailDash para instalar en tu celular Android.',
    download: 'Descargar APK',
    loginCta: 'Descargar app para Android',
  },
} as const;

/**
 * Botão de download do APK Android.
 * - `variant="card"`: card completo (página de configurações)
 * - `variant="link"`: botão sutil (página de login)
 * Esconde-se quando já está rodando dentro do APK (plataforma nativa).
 */
export default function ApkDownloadButton({ variant = 'link' }: { variant?: 'card' | 'link' }) {
  const { locale } = useT();
  const txt = TXT[locale] ?? TXT['pt-BR'];
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) setIsNative(true);
      } catch {
        /* sem Capacitor — é navegador, mostra normalmente */
      }
    })();
  }, []);

  if (isNative) return null;

  if (variant === 'card') {
    return (
      <div className="card">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-nd-border/50">
          <Smartphone className="w-4 h-4 text-nd-accent" />
          <h2 className="text-sm font-semibold text-nd-heading">{txt.title}</h2>
        </div>
        <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-sm text-nd-muted">{txt.subtitle}</p>
          <a
            href={APK_URL}
            download="NailDash.apk"
            className="btn-primary text-sm shrink-0 inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {txt.download}
          </a>
        </div>
      </div>
    );
  }

  return (
    <a
      href={APK_URL}
      download="NailDash.apk"
      className="w-full flex items-center justify-center gap-2 px-5 py-3
                 text-nd-heading font-semibold text-sm rounded-xl
                 border border-nd-border/60 bg-white/60
                 transition-all duration-200 hover:bg-white hover:shadow-soft
                 active:scale-[0.98]"
    >
      <Smartphone className="w-4 h-4 text-nd-accent" />
      {txt.loginCta}
    </a>
  );
}
