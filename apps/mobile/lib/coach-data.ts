import { supabase } from './supabase';
import { sessionTypeLabel } from './parent-data';

export type CoachSessionRow = {
  id: string;
  scheduled_datetime: string;
  duration_minutes: number | null;
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
      duration_minutes,
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
      duration_minutes: s.duration_minutes,
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

/** Scheduled sessions whose end time has passed and still need coach closeout. */
export async function fetchCoachUnclosedSessions(
  coachUserId: string
): Promise<CoachSessionRow[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      `
      id,
      scheduled_datetime,
      duration_minutes,
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
    .eq('status', 'scheduled')
    // 30-minute grace before the recorded start: coaches who finish early (or
    // log a session with a slightly-future time) can still close out instead of
    // the app looking like the session "didn't happen".
    .lte('scheduled_datetime', new Date(Date.now() + 30 * 60 * 1000).toISOString())
    .order('scheduled_datetime', { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);

  const now = Date.now();
  return (data ?? [])
    .map((s) => {
      const fac = s.facilities as { name: string } | { name: string }[] | null;
      return {
        id: s.id,
        scheduled_datetime: s.scheduled_datetime,
        duration_minutes: s.duration_minutes,
        status: s.status,
        focus_area: s.focus_area,
        session_type: s.session_type,
        current_participants: s.current_participants,
        max_participants: s.max_participants,
        athlete_paid: s.athlete_paid,
        athlete_payout_date: s.athlete_payout_date,
        facilities: Array.isArray(fac) ? fac[0] ?? null : fac,
      };
    })
    .filter(
      (session) =>
        new Date(session.scheduled_datetime).getTime() +
          (session.duration_minutes ?? 60) * 60_000 <=
        now
    );
}

export function coachSessionTitle(s: CoachSessionRow): string {
  return s.focus_area?.trim() || sessionTypeLabel(s.session_type);
}
