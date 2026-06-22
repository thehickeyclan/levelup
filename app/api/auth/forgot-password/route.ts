import { NextRequest, NextResponse } from 'next/server';
import { getTenantByDomain } from '@/config/tenants';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/send-transactional';
import {
  buildPasswordRecoveryConfirmUrl,
  passwordRecoveryEmailContent,
} from '@/lib/auth/forgot-password-email';
import { getPublicSiteUrlFromRequest } from '@/lib/public-site-url';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send password recovery via admin generateLink + Resend — bypasses Supabase built-in SMTP
 * (2 emails/hour project-wide) which locks out all users during testing or support resets.
 */
export async function POST(req: NextRequest) {
  try {
    const hostname = req.headers.get('host') || '';
    const tenant = getTenantByDomain(hostname);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY?.trim()) {
      console.error('[forgot-password] RESEND_API_KEY not set — cannot send recovery email');
      return NextResponse.json(
        {
          error:
            'Password reset email is temporarily unavailable. Contact info@WrestlingGuild.com for help.',
          code: 'email_not_configured',
        },
        { status: 503 }
      );
    }

    const admin = createAdminClient(tenant.slug);
    const siteUrl = getPublicSiteUrlFromRequest(req);
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${siteUrl}/auth/confirm`,
      },
    });

    // Avoid email enumeration — same response whether or not the account exists.
    if (error) {
      const msg = error.message || '';
      if (/not found|no user|user not found/i.test(msg)) {
        return NextResponse.json({ ok: true });
      }
      console.error('[forgot-password] generateLink:', msg);
      return NextResponse.json(
        { error: 'Could not process reset request. Try again or contact info@WrestlingGuild.com.' },
        { status: 500 }
      );
    }

    const hashedToken = data?.properties?.hashed_token;
    if (!hashedToken) {
      console.error('[forgot-password] generateLink returned no hashed_token');
      return NextResponse.json(
        { error: 'Could not process reset request. Try again or contact info@WrestlingGuild.com.' },
        { status: 500 }
      );
    }

    const resetUrl = buildPasswordRecoveryConfirmUrl(req, hashedToken);
    const { subject, html, text } = passwordRecoveryEmailContent(resetUrl);
    const sent = await sendTransactionalEmail({ to: email, subject, html, text });

    if (!sent.ok) {
      if (sent.skipped) {
        return NextResponse.json(
          {
            error:
              'Password reset email is temporarily unavailable. Contact info@WrestlingGuild.com for help.',
            code: 'email_not_configured',
          },
          { status: 503 }
        );
      }
      console.error('[forgot-password] Resend:', sent.error);
      return NextResponse.json(
        {
          error: 'Could not send reset email. Try again in a few minutes or contact info@WrestlingGuild.com.',
          code: 'send_failed',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[forgot-password] exception:', e);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
