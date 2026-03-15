import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error_param = searchParams.get('error');
  const error_description = searchParams.get('error_description');
  const next = searchParams.get('next') ?? '/dashboard';

  console.log('=== AUTH CALLBACK ===');
  console.log('URL:', request.url);
  console.log('Code present:', !!code);
  console.log('Error param:', error_param);
  console.log('Error desc:', error_description);

  // If Supabase/Google sent an error
  if (error_param) {
    console.error('OAuth provider error:', error_param, error_description);
    return NextResponse.redirect(`${origin}/login?error=${error_param}`);
  }

  if (code) {
    const cookieStore = cookies();

    // Log all cookies to see if code_verifier is present
    const allCookies = cookieStore.getAll();
    console.log('Cookies available:', allCookies.map(c => c.name));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            const val = cookieStore.get(name)?.value;
            console.log(`Cookie GET [${name}]:`, val ? 'exists' : 'MISSING');
            return val;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              console.log(`Cookie SET [${name}]`);
              cookieStore.set({ name, value, ...options });
            } catch (e) {
              console.error(`Cookie SET error [${name}]:`, e);
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              console.log(`Cookie REMOVE [${name}]`);
              cookieStore.set({ name, value: '', ...options, maxAge: 0 });
            } catch (e) {
              console.error(`Cookie REMOVE error [${name}]:`, e);
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    console.log('Exchange result - user:', data?.user?.email);
    console.log('Exchange result - session:', !!data?.session);
    console.log('Exchange result - error:', error?.message);

    if (!error) {
      console.log('SUCCESS - redirecting to:', next);
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error('Exchange failed:', error.message);
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  console.error('No code in callback URL');
  return NextResponse.redirect(`${origin}/login?error=no_code`);
}