import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPasswordRecoveryConfirmUrl } from '@/lib/auth/forgot-password-email';
import { getPublicSiteUrlFromRequest } from '@/lib/public-site-url';
import { createClient } from '@/lib/supabase/server';
import { friendlyResendError } from '@/lib/email/resend-from';

function isLocalDevHost(hostname: string): boolean {
  const h = hostname.split(':')[0].toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
}

export type ForgotPasswordResult =
  | { ok: true; dev_reset_url?: string }
  | { ok: false; error: string; code: string; status: number };

/**
 * Generate recovery link and send email (Resend), or fall back to Supabase SMTP / dev URL.
 */
export async function sendPasswordRecoveryEmail(
  req: NextRequest,
  tenantSlug: string,
  email: string
): Promise<ForgotPasswordResult> {
  const hostname = req.headers.get('host') || '';
  const siteUrl = getPublicSiteUrlFromRequest(req);
  const redirectTo = `${siteUrl}/auth/confirm`;
  const isLocalDev = process.env.NODE_ENV === 'development' || isLocalDevHost(hostname);
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim());
  let resendError: string | null = null;

  const admin = createAdminClient(tenantSlug);
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });

  if (error) {
    const msg = error.message || '';
    if (/not found|no user|user not found/i.test(msg)) {
      return { ok: true };
    }
    console.error('[forgot-password] generateLink:', msg);
    return {
      ok: false,
      error: 'Could not process reset request. Try again or contact info@WrestlingGuild.com.',
      code: 'generate_failed',
      status: 500,
    };
  }

  const hashedToken = data?.properties?.hashed_token;
  if (!hashedToken) {
    console.error('[forgot-password] generateLink returned no hashed_token');
    return {
      ok: false,
      error: 'Could not process reset request. Try again or contact info@WrestlingGuild.com.',
      code: 'generate_failed',
      status: 500,
    };
  }

  const resetUrl = buildPasswordRecoveryConfirmUrl(req, hashedToken);

  if (hasResend) {
    const { sendTransactionalEmail } = await import('@/lib/email/send-transactional');
    const { passwordRecoveryEmailContent } = await import('@/lib/auth/forgot-password-email');
    const { subject, html, text } = passwordRecoveryEmailContent(resetUrl);
    const sent = await sendTransactionalEmail({ to: email, subject, html, text });

    if (sent.ok) {
      return { ok: true };
    }

    if (sent.skipped) {
      console.warn('[forgot-password] Resend skipped after generateLink');
    } else {
      resendError = sent.error;
      console.error('[forgot-password] Resend failed:', sent.error);
    }
  }

  if (isLocalDev) {
    console.log('[forgot-password] Local dev reset link for', email, resetUrl);
    return { ok: true, dev_reset_url: resetUrl };
  }

  // Resend failed or missing — Supabase built-in email (rate limits apply).
  try {
    const supabase = await createClient(tenantSlug);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (resetErr) {
      const msg = resetErr.message || '';
      if (/not found|no user|user not found/i.test(msg)) {
        return { ok: true };
      }
      console.error('[forgot-password] resetPasswordForEmail:', msg);
      const rateLimited = /rate limit|too many|exceeded/i.test(msg);
      if (rateLimited) {
        return {
          ok: false,
          error:
            'Too many reset emails were sent recently. Wait about an hour and try again, or contact info@WrestlingGuild.com.',
          code: 'rate_limited',
          status: 503,
        };
      }
      if (resendError) {
        return {
          ok: false,
          error: `Could not send reset email. ${friendlyResendError(resendError)}`,
          code: 'send_failed',
          status: 503,
        };
      }
      return {
        ok: false,
        error:
          'Password reset email is temporarily unavailable. Contact info@WrestlingGuild.com for help.',
        code: 'email_not_configured',
        status: 503,
      };
    }
    if (resendError) {
      console.warn(
        '[forgot-password] Resend failed; sent via Supabase SMTP fallback:',
        resendError
      );
    }
    return { ok: true };
  } catch (e) {
    console.error('[forgot-password] resetPasswordForEmail exception:', e);
    if (resendError) {
      return {
        ok: false,
        error: `Could not send reset email. ${friendlyResendError(resendError)}`,
        code: 'send_failed',
        status: 503,
      };
    }
    return {
      ok: false,
      error:
        'Password reset email is temporarily unavailable. Contact info@WrestlingGuild.com for help.',
      code: 'email_not_configured',
      status: 503,
    };
  }
}
