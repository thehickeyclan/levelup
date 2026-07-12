import type { SupabaseClient } from '@supabase/supabase-js';
import { isSessionParentPaymentReceived, participantAmountPaidSum } from '@/lib/coach-payout-status';

export type PendingCoachPayoutStats = {
  /** Completed, parent-paid sessions awaiting coach payout. */
  sessionCount: number;
  /** Coaches with at least one session in the queue. */
  coachCount: number;
};

type SessionRow = {
  status: string;
  athlete_payout_date?: string | null;
  athlete_paid?: boolean | null;
  athletes?: { id?: string } | { id?: string }[] | null;
  session_participants?:
    | { paid?: boolean | null; amount_paid?: number | null }[]
    | { paid?: boolean | null; amount_paid?: number | null }
    | null;
};

export function computePendingCoachPayoutStats(sessions: SessionRow[]): PendingCoachPayoutStats {
  const coachIds = new Set<string>();
  let sessionCount = 0;

  for (const s of sessions) {
    if (s.status !== 'completed' || s.athlete_payout_date != null) continue;

    const participants = Array.isArray(s.session_participants)
      ? s.session_participants
      : s.session_participants
        ? [s.session_participants]
        : [];

    const parentPaid = isSessionParentPaymentReceived({
      athlete_paid: s.athlete_paid,
      participant_amount_paid_sum: participantAmountPaidSum(participants),
      participants,
    });
    if (!parentPaid) continue;

    sessionCount += 1;
    const coach = Array.isArray(s.athletes) ? s.athletes[0] : s.athletes;
    if (coach?.id) coachIds.add(coach.id);
  }

  return { sessionCount, coachCount: coachIds.size };
}

export async function fetchPendingCoachPayoutStats(
  db: SupabaseClient
): Promise<PendingCoachPayoutStats> {
  const { data, error } = await db
    .from('sessions')
    .select(
      'status, athlete_payout_date, athlete_paid, athletes(id), session_participants(paid, amount_paid)'
    )
    .eq('status', 'completed')
    .is('athlete_payout_date', null);

  if (error) {
    console.error('fetchPendingCoachPayoutStats:', error);
    return { sessionCount: 0, coachCount: 0 };
  }

  return computePendingCoachPayoutStats((data ?? []) as SessionRow[]);
}
