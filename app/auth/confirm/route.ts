import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';

/**
 * Password recovery / email confirm landing.
 *
 * Handles:
 * - token_hash + type=recovery (works in any browser — set Supabase recovery email template)
 * - PKCE code (works when the same browser requested the reset)
 */
export async function GET(req: NextRequest) {
  const hostname = resolveHostnameFromHeaders(req.headers);
  const tenant = getTenantByDomain(hostname);

  if (!tenant) {
    return NextResponse.redirect(new URL('/login?error=unknown_site', req.url));
  }

  const { searchParams } = new URL(req.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const nextPath = searchParams.get('next')?.trim() || '/reset-password';

  const safeNext =
    nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/reset-password';

  const fail = (reason: string) => {
    const url = new URL('/reset-password', req.url);
    url.searchParams.set('error', reason);
    return NextResponse.redirect(url);
  };

  const supabase = await createClient(tenant.slug);

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) {
      console.error('auth/confirm verifyOtp:', error.message);
      return fail('verify_failed');
    }
    return NextResponse.redirect(new URL(safeNext, req.url));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('auth/confirm exchangeCode:', error.message);
      const reason = /code verifier|pkce/i.test(error.message)
        ? 'pkce_browser'
        : 'exchange_failed';
      return fail(reason);
    }
    return NextResponse.redirect(new URL(safeNext, req.url));
  }

  return fail('missing_token');
}
