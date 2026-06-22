/** Default From when EMAIL_FROM is unset — Resend only delivers to your Resend account email. */
export function resendFromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || 'The Guild <onboarding@resend.dev>';
}

export function friendlyResendError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('domain') && m.includes('verify')) {
    return 'Sender domain is not verified in Resend. Add EMAIL_FROM with a verified domain (e.g. info@WrestlingGuild.com).';
  }
  if (m.includes('from') || m.includes('sender')) {
    return 'Invalid sender (EMAIL_FROM). Use an address on a domain verified in Resend.';
  }
  if (m.includes('only send') || m.includes('testing')) {
    return 'Resend test mode only allows sending to your Resend account email. Verify wrestlingguild.com in Resend or use that address for testing.';
  }
  if (m.includes('rate') || m.includes('limit')) {
    return 'Email rate limit hit. Wait a few minutes and try again.';
  }
  return message;
}
