export type CoachPayoutDisplayStatus =
  | 'paid'
  | 'payout_pending'
  | 'awaiting_parent_payment'
  | 'not_completed';

type ParticipantPaymentRow = {
  paid?: boolean | null;
  amount_paid?: number | null;
};

/**
 * Guild model: parents pay (Stripe, credits, or $0 confirm) before a wrestler is on the roster.
 * `paid = true` on session_participants means entry is confirmed. `paid = false` is a hold
 * (e.g. join approved, checkout not finished) — not a completed paid spot.
 */
export function isSessionParentPaymentReceived(session: {
  athlete_paid?: boolean | null;
  participant_amount_paid_sum?: number | null;
  participants?: ParticipantPaymentRow[] | null;
}): boolean {
  const rows = Array.isArray(session.participants) ? session.participants : [];

  if (rows.some((p) => p.paid === true)) return true;

  const sum = Number(session.participant_amount_paid_sum ?? 0);
  if (!Number.isNaN(sum) && sum > 0) return true;

  if (session.athlete_paid === true) return true;

  return false;
}

export function coachPayoutDisplayStatus(session: {
  status?: string | null;
  athlete_payout_date?: string | null;
  athlete_paid?: boolean | null;
  participant_amount_paid_sum?: number | null;
  participants?: ParticipantPaymentRow[] | null;
}): CoachPayoutDisplayStatus {
  if (session.status !== 'completed') return 'not_completed';
  if (session.athlete_payout_date) return 'paid';
  if (isSessionParentPaymentReceived(session)) return 'payout_pending';
  return 'awaiting_parent_payment';
}

export function coachPayoutStatusLabel(status: CoachPayoutDisplayStatus): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'payout_pending':
      return 'Payout pending';
    case 'awaiting_parent_payment':
      return 'Unpaid spot';
    default:
      return '';
  }
}

/** Tailwind classes for admin/coach payout status badges. */
export function coachPayoutStatusBadgeClass(status: CoachPayoutDisplayStatus): string {
  switch (status) {
    case 'paid':
      return 'border-[#B89D60] bg-[#B89D60]/20 text-[#B89D60] hover:bg-[#B89D60]/20 hover:text-[#B89D60]';
    case 'payout_pending':
      return 'border-orange-500 bg-orange-500/20 text-orange-400 hover:bg-orange-500/20 hover:text-orange-400';
    case 'awaiting_parent_payment':
      return 'border-amber-600/50 bg-amber-600/10 text-amber-500 hover:bg-amber-600/10 hover:text-amber-500';
    default:
      return '';
  }
}

export function participantAmountPaidSum(
  participants:
    | ParticipantPaymentRow[]
    | ParticipantPaymentRow
    | null
    | undefined
): number {
  const rows = Array.isArray(participants) ? participants : participants ? [participants] : [];
  return rows.reduce((sum, p) => {
    if (p.paid === false) return sum;
    return sum + Number(p.amount_paid ?? 0);
  }, 0);
}
