import { Resend } from 'resend';
import { resendFromAddress } from '@/lib/email/resend-from';

let resendSingleton: Resend | null | undefined;

function getResend(): Resend | null {
  if (resendSingleton !== undefined) return resendSingleton;
  const key = process.env.RESEND_API_KEY?.trim();
  resendSingleton = key ? new Resend(key) : null;
  return resendSingleton;
}

export type SendTransactionalResult =
  | { ok: true }
  | { ok: false; skipped: true }
  | { ok: false; skipped: false; error: string };

/**
 * Sends via Resend when RESEND_API_KEY is set; otherwise logs once and returns skipped.
 * Does not throw — API routes should treat email as best-effort after DB success.
 */
export async function sendTransactionalEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<SendTransactionalResult> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set; skipping send:', opts.subject);
    return { ok: false, skipped: true };
  }

  const from = resendFromAddress();
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];

  try {
    const { error } = await resend.emails.send({
      from,
      to: toList,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo,
    });

    if (error) {
      console.error('[email] Resend API error:', error);
      return { ok: false, skipped: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[email] send exception:', e);
    return { ok: false, skipped: false, error: msg };
  }
}
