'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/contexts/LanguageContext';
import { Loader2, Sparkles } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-nd-bg" />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const { t } = useT();

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(t.authFailed);
    }
  }, [searchParams, t.authFailed]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      const redirectUrl = `${window.location.origin}/auth/callback`;
      console.log('Redirecting to Google OAuth, callback:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('OAuth error:', error);
        setError(t.authFailed);
        setLoading(false);
      } else {
        console.log('OAuth redirect URL:', data?.url);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      setError(t.authFailed);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-nd-bg relative overflow-hidden flex items-center justify-center">
      {/* Warm gradient overlays */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-to-b from-nd-highlight/8 to-transparent rounded-full blur-[100px]" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-t from-nd-accent/6 to-transparent rounded-full blur-[120px]" />
      <div className="absolute top-1/4 left-0 w-[300px] h-[300px] bg-gradient-to-r from-nd-warning/5 to-transparent rounded-full blur-[80px]" />

      {/* Subtle dot pattern */}
      <div className="absolute inset-0 bg-pattern opacity-50" />

      {/* Decorative elements */}
      <div className="absolute top-20 right-16 w-20 h-20 border border-nd-accent/10 rounded-full animate-float hidden lg:block" />
      <div className="absolute bottom-32 left-20 w-12 h-12 border border-nd-highlight/15 rounded-full animate-float hidden lg:block" style={{ animationDelay: '2s' }} />
      <div className="absolute top-40 left-32 w-6 h-6 bg-nd-accent/8 rounded-full animate-float hidden lg:block" style={{ animationDelay: '4s' }} />

      {/* Content */}
      <div className="relative z-10 w-full max-w-[380px] mx-auto px-6 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-nd-accent to-nd-highlight mb-6 shadow-soft-lg">
            <Sparkles className="w-9 h-9 text-white" />
          </div>
          <h1 className="font-display text-3xl font-bold text-nd-heading tracking-tight">
            Nail<span className="text-nd-accent">Dash</span>
          </h1>
          <p className="text-nd-muted text-sm mt-2">
            {t.tagline}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl shadow-soft-lg p-7 border border-nd-border/40">
          <div className="space-y-5">
            <div>
              <h2 className="font-display font-semibold text-nd-heading text-lg">
                {t.welcomeBack}
              </h2>
              <p className="text-nd-muted text-sm mt-1">
                {t.signInSubtitle}
              </p>
            </div>

            {/* Google Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5
                         bg-nd-heading text-white font-semibold text-sm rounded-xl
                         transition-all duration-200
                         hover:bg-nd-text hover:shadow-soft-lg
                         active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#8BB4F6"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#7EB89C"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#D4A853"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#D4756A"/>
                </svg>
              )}
              {loading ? t.connecting : t.continueWithGoogle}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-nd-border/60" />
              <span className="text-[11px] text-nd-muted/60">{t.or}</span>
              <div className="flex-1 h-px bg-nd-border/60" />
            </div>

            {/* Email login (for future) */}
            <div className="space-y-3">
              <input
                type="email"
                placeholder="seu@email.com"
                className="input-field"
                disabled
              />
              <button className="btn-secondary w-full opacity-50 cursor-not-allowed" disabled>
                {t.signInWithEmail}
                <span className="badge-muted ml-2 text-[9px]">{t.comingSoon}</span>
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-nd-danger/8 border border-nd-danger/15">
                <span className="text-xs text-nd-danger">{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-[11px] text-nd-muted/50">
            NailDash v0.2
          </p>
        </div>
      </div>
    </div>
  );
}
