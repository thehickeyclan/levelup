/** Sessions that still accept parent Stripe checkout or admin payment collection. */
export function isSessionOpenForRegistrationPayment(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'scheduled' || s === 'completed';
}

/** User-facing message when checkout is blocked by session status (not datetime). */
export function registrationPaymentBlockedMessage(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'cancelled') return 'This session was cancelled and is no longer open for payment.';
  if (s === 'no-show') return 'This session is closed and is no longer open for payment.';
  if (s === 'completed') {
    return 'Session is not open for registration. Contact support if you still need to pay.';
  }
  return 'Session is not open for registration';
}
