/** Sessions that still accept parent Stripe checkout or admin payment collection. */
export function isSessionOpenForRegistrationPayment(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'scheduled' || s === 'completed';
}

/** True when the session start time has already passed (late payment / post-session checkout). */
export function isPastSessionDatetime(scheduledDatetime: string | null | undefined): boolean {
  if (!scheduledDatetime) return false;
  const dt = new Date(scheduledDatetime);
  return !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now();
}

/** User-facing message when checkout is blocked by session status (not datetime). */
export function registrationPaymentBlockedMessage(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'cancelled') return 'This session was cancelled and is no longer open for payment.';
  if (s === 'no-show') return 'This session is closed and is no longer open for payment.';
  if (s === 'completed' || s === 'scheduled') {
    return 'This session is not open for payment right now.';
  }
  return 'Session is not open for registration';
}
