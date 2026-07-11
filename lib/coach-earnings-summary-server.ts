import type { SupabaseClient } from '@supabase/supabase-js';
import { formatEST } from '@/lib/format-date';
import { coachPayoutUsd } from '@/lib/coach-session-payout';
import {
  isSessionParentPaymentReceived,
  participantAmountPaidSum,
} from '@/lib/coach-payout-status';

/** Row shape returned by fetchPastSessionsForCoachEarnings. */
export type CoachEarningsSessionRow = {
  id: string;
  athlete_id?: string;
  scheduled_datetime: string | null;
  completed_at?: string | null;
  athlete_payment?: number | null;
  total_price?: number | null;
  session_type?: string | null;
  current_participants?: number | null;
  price_per_participant?: number | null;
  session_payout_rate?: number | null;
  status: string | null;
  athlete_payout_date?: string | null;
  athlete_paid?: boolean | null;
  session_participants?: { amount_paid?: number | null; paid?: boolean | null }[] | null;
};

export function isCoachSessionEarningsEligible(
  s: { status: string | null; scheduled_datetime: string | null },
  nowIso: string
): boolean {
  const st = s.status ?? '';
  if (st === 'cancelled' || st === 'no-show') return false;
  if (st === 'completed') return true;
  const t = s.scheduled_datetime ? new Date(s.scheduled_datetime).getTime() : NaN;
  if (Number.isNaN(t)) return false;
  return t < new Date(nowIso).getTime() && st === 'scheduled';
}

/** Calendar month (Eastern) when a session counts toward "this month" earnings. */
export function coachEarningsMonthAnchor(s: CoachEarningsSessionRow): string | null {
  if (s.status === 'completed') {
    return s.completed_at ?? s.scheduled_datetime ?? null;
  }
  return s.scheduled_datetime ?? null;
}

export function coachEarningsMonthKey(s: CoachEarningsSessionRow): string | null {
  const anchor = coachEarningsMonthAnchor(s);
  if (!anchor) return null;
  return formatEST(anchor, 'yyyy-MM');
}

export function isCoachSessionInEarningsMonth(
  s: CoachEarningsSessionRow,
  monthKey: string
): boolean {
  return coachEarningsMonthKey(s) === monthKey;
}

/** Revenue counts only after coach marks the session complete (close-out). */
export function isCoachSessionClosedOutForEarnings(s: { status: string | null }): boolean {
  return s.status === 'completed';
}

/** One session’s coach share — same math as Dashboard, /coach-earnings, and leaderboard (after eligibility filter). */
export function payoutUsdForCoachEarningsSession(
  s: CoachEarningsSessionRow,
  coachDefaultPayoutRate: number
): number {
  const participantAmountPaidSum = Array.isArray(s.session_participants)
    ? s.session_participants.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0)
    : 0;
  const rate =
    s.session_payout_rate != null ? Number(s.session_payout_rate) : Number(coachDefaultPayoutRate);
  return coachPayoutUsd(
    {
      athlete_payment: s.athlete_payment,
      price_per_participant: s.price_per_participant,
      current_participants: s.current_participants,
      participant_amount_paid_sum: participantAmountPaidSum > 0 ? participantAmountPaidSum : null,
    },
    rate
  );
}

/** Same projection as Dashboard + coach-earnings pages (admin/service client). */
export async function fetchPastSessionsForCoachEarnings(
  admin: SupabaseClient,
  coachId: string,
  nowIso: string
): Promise<CoachEarningsSessionRow[]> {
  const { data, error } = await admin
    .from('sessions')
    .select(
      `
      id,
      scheduled_datetime,
      completed_at,
      athlete_payment,
      total_price,
      session_type,
      current_participants,
      price_per_participant,
      session_payout_rate,
      status,
      athlete_payout_date,
      athlete_paid,
      session_participants(id, amount_paid, paid)
    `
    )
    .eq('athlete_id', coachId)
    .or(`status.eq.completed,status.eq.cancelled,status.eq.no-show,scheduled_datetime.lt.${nowIso}`)
    .not('scheduled_datetime', 'is', null)
    .order('scheduled_datetime', { ascending: false });

  if (error) {
    console.error('[fetchPastSessionsForCoachEarnings]', error.message);
    return [];
  }
  return (data ?? []) as CoachEarningsSessionRow[];
}

export type CoachEarningsSummary = {
  earningsSessions: CoachEarningsSessionRow[];
  thisMonthSessions: CoachEarningsSessionRow[];
  thisMonthEarnings: number;
  allTimeEarnings: number;
  pendingPayoutAmount: number;
  pendingPayoutSessionCount: number;
  getSessionPayout: (s: CoachEarningsSessionRow) => number;
};

/**
 * Metrics shown on Dashboard and /coach-earnings — keep logic identical so mobile tab matches dashboard.
 */
export function summarizeCoachEarningsFromPastSessions(
  pastSessionsRaw: CoachEarningsSessionRow[] | null | undefined,
  coachDefaultPayoutRate: number,
  nowIso: string
): CoachEarningsSummary {
  const earningsSessions = (pastSessionsRaw ?? []).filter((s) => isCoachSessionEarningsEligible(s, nowIso));

  const getSessionPayout = (s: CoachEarningsSessionRow) => payoutUsdForCoachEarningsSession(s, coachDefaultPayoutRate);

  const closedOutSessions = earningsSessions.filter(isCoachSessionClosedOutForEarnings);

  const thisMonthKey = formatEST(nowIso, 'yyyy-MM');
  const thisMonthSessions = closedOutSessions.filter((s) => isCoachSessionInEarningsMonth(s, thisMonthKey));

  const thisMonthEarnings = thisMonthSessions.reduce((sum, s) => sum + getSessionPayout(s), 0);
  const allTimeEarnings = closedOutSessions.reduce((sum, s) => sum + getSessionPayout(s), 0);

  let pendingPayoutAmount = 0;
  let pendingPayoutSessionCount = 0;
  for (const s of earningsSessions) {
    if (s.status !== 'completed' || s.athlete_payout_date) continue;
    const paidSum = participantAmountPaidSum(s.session_participants);
    if (!isSessionParentPaymentReceived({
      athlete_paid: s.athlete_paid,
      participant_amount_paid_sum: paidSum,
      participants: s.session_participants ?? null,
    })) {
      continue;
    }
    pendingPayoutAmount += getSessionPayout(s);
    pendingPayoutSessionCount += 1;
  }

  return {
    earningsSessions,
    thisMonthSessions,
    thisMonthEarnings,
    allTimeEarnings,
    pendingPayoutAmount,
    pendingPayoutSessionCount,
    getSessionPayout,
  };
}
