/**
 * Coach payout for a session (USD). Single source of truth for admin payouts,
 * coach schedule UI, and APIs.
 *
 * - If `athlete_payment` is set (> 0), use it (bookings, Stripe, or manual record).
 * - Else if we know what parents actually paid (sum of `session_participants.amount_paid`),
 *   coach share = that total × rate (default 80% via `COACH_REVENUE_FRACTION`; overrides on `session_payout_rate` / `athletes.payout_rate`).
 * - Otherwise estimate from roster: list price per slot × participants × coach share.
 */
import { COACH_REVENUE_FRACTION, normalizeCoachRevenueShareRate } from '@/lib/pricing';

/**
 * For **upcoming** sessions, ignore `athlete_payment` so projected earnings match
 * paid totals × rate (same basis as "when full"). Stored payout is only meaningful
 * after the session is marked completed.
 */
export function athletePaymentForCoachEstimate(session: {
  status?: string;
  athlete_payment?: number | null;
}): number | null {
  if (session.status !== 'completed') return null;
  const ap = session.athlete_payment;
  if (ap == null || Number(ap) <= 0) return null;
  return Number(ap);
}

export type SessionCoachPayoutFields = {
  athlete_payment?: number | null;
  price_per_participant?: number | null;
  current_participants?: number | null;
  /** Sum of session_participants.amount_paid when loaded — reflects discounts vs list price */
  participant_amount_paid_sum?: number | null;
  /** Snapshot on the session row (preferred for estimates when set). */
  session_payout_rate?: number | null;
  /** From `athletes.payout_rate` when session snapshot is missing. */
  coach_payout_rate?: number | null;
};

/** Resolve revenue share for coach estimates: explicit arg → session → athlete → app default (80%). */
export function resolveCoachPayoutRate(
  session: SessionCoachPayoutFields,
  explicitRate?: number
): number {
  if (explicitRate != null && !Number.isNaN(Number(explicitRate))) {
    return normalizeCoachRevenueShareRate(Number(explicitRate));
  }
  if (session.session_payout_rate != null && !Number.isNaN(Number(session.session_payout_rate))) {
    return normalizeCoachRevenueShareRate(Number(session.session_payout_rate));
  }
  if (session.coach_payout_rate != null && !Number.isNaN(Number(session.coach_payout_rate))) {
    return normalizeCoachRevenueShareRate(Number(session.coach_payout_rate));
  }
  return COACH_REVENUE_FRACTION;
}

export function coachPayoutUsd(session: SessionCoachPayoutFields, payoutRate?: number): number {
  const rate = resolveCoachPayoutRate(session, payoutRate);
  if (session.athlete_payment != null && Number(session.athlete_payment) > 0) {
    return Math.round(Number(session.athlete_payment) * 100) / 100;
  }
  const paidSum =
    session.participant_amount_paid_sum != null ? Number(session.participant_amount_paid_sum) : 0;
  if (!Number.isNaN(paidSum) && paidSum > 0) {
    return Math.round(paidSum * rate * 100) / 100;
  }
  const per = Number(session.price_per_participant ?? 0);
  const n = Number(session.current_participants ?? 0);
  return Math.round(per * rate * n * 100) / 100;
}

/** Coach-facing dashboards: show cents so totals match Stripe / payouts. */
export function formatUsdTwoDecimals(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
