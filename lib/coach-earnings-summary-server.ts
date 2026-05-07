import type { SupabaseClient } from '@supabase/supabase-js';
import { formatEST } from '@/lib/format-date';
import { coachPayoutUsd } from '@/lib/coach-session-payout';

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
  session_participants?: { amount_paid?: number | null }[] | null;
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
      session_participants(id, amount_paid)
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

  const thisMonthKey = formatEST(new Date(), 'yyyy-MM');
  const thisMonthSessions = earningsSessions.filter(
    (s) => s.scheduled_datetime && formatEST(s.scheduled_datetime, 'yyyy-MM') === thisMonthKey
  );

  const thisMonthEarnings = thisMonthSessions.reduce((sum, s) => sum + getSessionPayout(s), 0);
  const allTimeEarnings = earningsSessions.reduce((sum, s) => sum + getSessionPayout(s), 0);

  return {
    earningsSessions,
    thisMonthSessions,
    thisMonthEarnings,
    allTimeEarnings,
    getSessionPayout,
  };
}
