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
};

export async function fetchCoachUpcomingSessions(coachUserId: string): Promise<CoachSessionRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
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
      facilities(name)
    `
    )
    .eq('athlete_id', coachUserId)
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', now)
    .order('scheduled_datetime', { ascending: true })
    .limit(30);

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
      facilities: facility,
    };
  });
}

export function coachSessionTitle(s: CoachSessionRow): string {
  return s.focus_area?.trim() || sessionTypeLabel(s.session_type);
}
