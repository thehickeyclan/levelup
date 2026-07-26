import { supabase } from './supabase';
import { sessionTypeLabel } from './parent-data';

export type CoachSessionRow = {
  id: string;
  scheduled_datetime: string;
  status: string;
  focus_area: string | null;
  session_type: string | null;
  current_participants: number | null;
  max_participants: number | null;
  facilities: { name: string } | null;
  athlete_paid?: boolean | null;
  athlete_payout_date?: string | null;
};

export async function fetchCoachSessions(
  coachUserId: string,
  view: 'upcoming' | 'past' = 'upcoming'
): Promise<CoachSessionRow[]> {
  const now = new Date().toISOString();
  let query = supabase
    .from('sessions')
    .select(
      `
      id,
      scheduled_datetime,
      status,
      focus_area,
      session_type,
      current_participants,
      max_participants,
      athlete_paid,
      athlete_payout_date,
      facilities(name)
    `
    )
    .eq('athlete_id', coachUserId)
    .order('scheduled_datetime', { ascending: view === 'upcoming' })
    .limit(50);

  query =
    view === 'upcoming'
      ? query.eq('status', 'scheduled').gte('scheduled_datetime', now)
      : query.or(`status.eq.completed,status.eq.cancelled,status.eq.no-show,scheduled_datetime.lt.${now}`);

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []).map((s) => {
    const fac = s.facilities as { name: string } | { name: string }[] | null;
    const facility = Array.isArray(fac) ? fac[0] ?? null : fac;
    return {
      id: s.id,
      scheduled_datetime: s.scheduled_datetime,
      status: s.status,
      focus_area: s.focus_area,
      session_type: s.session_type,
      current_participants: s.current_participants,
      max_participants: s.max_participants,
      athlete_paid: s.athlete_paid,
      athlete_payout_date: s.athlete_payout_date,
      facilities: facility,
    };
  });
}

export function fetchCoachUpcomingSessions(coachUserId: string): Promise<CoachSessionRow[]> {
  return fetchCoachSessions(coachUserId, 'upcoming');
}

export function coachSessionTitle(s: CoachSessionRow): string {
  return s.focus_area?.trim() || sessionTypeLabel(s.session_type);
}
