import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';

/**
 * Supabase recovery often lands with tokens in the URL **hash** (#access_token=…).
 * Hashes never reach the server — only the browser sees them. Forward to /reset-password
 * so the client can call setSession (see reset-password/page.tsx).
 */
function forwardHashToResetPassword(req: NextRequest): NextResponse {
  const target = new URL('/reset-password', req.url);
  const next = req.nextUrl.searchParams.get('next')?.trim();
  if (next?.startsWith('/') && !next.startsWith('//')) {
    target.searchParams.set('next', next);
  }
  const qs = target.searchParams.toString();
  const path = qs ? `${target.pathname}?${qs}` : target.pathname;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Redirecting…</title>
  <script>
    window.location.replace(${JSON.stringify(path)} + window.location.hash);
  </script>
</head>
<body>
  <p>Redirecting…</p>
  <p><a href="${path}">Continue</a></p>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Password recovery / email confirm landing.
 *
 * Handles:
 * - token_hash + type=recovery (works in any browser — set Supabase recovery email template)
 * - PKCE code (works when the same browser requested the reset)
 * - hash tokens (default Supabase email → forward to /reset-password client handler)
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

  // Default Supabase recovery email puts session tokens in the hash, not query params.
  return forwardHashToResetPassword(req);
}
