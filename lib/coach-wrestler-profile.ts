import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAthleteSmsPhone, resolveParentSmsPhone } from '@/lib/session-group-sms';
import {
  formatGraduationYearLabel,
  formatSkillLevelLabel,
  formatWeightClassLabel,
} from '@/lib/wrestler-roster-display';

export type CoachWrestlerProfile = {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  photoFocusX: number | null;
  photoFocusY: number | null;
  age: number | null;
  weightClass: string | null;
  skillLevel: string | null;
  graduationYear: string | null;
  school: string | null;
  athletePhone: string | null;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  } | null;
  sessionsWithCoach: number;
  completedWithCoach: number;
  upcomingWithCoach: number;
  lastSessionAt: string | null;
};

/** Coach may view wrestlers who have booked at least one session with them. */
export async function coachHasWrestlerRelationship(
  admin: SupabaseClient,
  coachId: string,
  youthWrestlerId: string
): Promise<boolean> {
  const { data: sessions } = await admin.from('sessions').select('id').eq('athlete_id', coachId);
  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  if (sessionIds.length === 0) return false;

  const { data: row } = await admin
    .from('session_participants')
    .select('id')
    .eq('youth_wrestler_id', youthWrestlerId)
    .in('session_id', sessionIds)
    .limit(1)
    .maybeSingle();

  return Boolean(row);
}

export async function fetchCoachWrestlerProfile(
  admin: SupabaseClient,
  coachId: string,
  youthWrestlerId: string
): Promise<CoachWrestlerProfile | null> {
  const allowed = await coachHasWrestlerRelationship(admin, coachId, youthWrestlerId);
  if (!allowed) return null;

  const { data: yw, error } = await admin
    .from('youth_wrestlers')
    .select(
      'id, first_name, last_name, photo_url, photo_focus_x, photo_focus_y, age, weight_class, skill_level, graduation_year, school, parent_id, phone'
    )
    .eq('id', youthWrestlerId)
    .maybeSingle();

  if (error || !yw) return null;

  const parentId = (yw as { parent_id?: string | null }).parent_id ?? null;
  let parent: CoachWrestlerProfile['parent'] = null;
  if (parentId) {
    const { data: pu } = await admin
      .from('users')
      .select('id, first_name, last_name, email, phone')
      .eq('id', parentId)
      .maybeSingle();
    if (pu) {
      const phone = await resolveParentSmsPhone(admin, parentId, youthWrestlerId);
      parent = {
        id: pu.id as string,
        firstName: (pu.first_name as string) ?? '',
        lastName: (pu.last_name as string) ?? '',
        email: (pu.email as string | null) ?? null,
        phone,
      };
    }
  }

  const athletePhone = await resolveAthleteSmsPhone(admin, youthWrestlerId);

  const { data: coachSessions } = await admin
    .from('sessions')
    .select('id, status, scheduled_datetime')
    .eq('athlete_id', coachId);
  const sessionMap = new Map(
    (coachSessions ?? []).map((s) => [
      s.id as string,
      { status: s.status as string, scheduled_datetime: s.scheduled_datetime as string },
    ])
  );
  const coachSessionIds = [...sessionMap.keys()];
  if (coachSessionIds.length === 0) {
    return buildProfile(yw, parent, athletePhone, 0, 0, 0, null);
  }

  const { data: parts } = await admin
    .from('session_participants')
    .select('session_id')
    .eq('youth_wrestler_id', youthWrestlerId)
    .in('session_id', coachSessionIds);

  const uniqueSessionIds = [...new Set((parts ?? []).map((p) => p.session_id as string))];
  const now = Date.now();
  let completed = 0;
  let upcoming = 0;
  let lastSessionAt: string | null = null;

  for (const sid of uniqueSessionIds) {
    const sess = sessionMap.get(sid);
    if (!sess) continue;
    if (sess.status === 'completed') completed += 1;
    if (sess.status === 'scheduled' && new Date(sess.scheduled_datetime).getTime() >= now) {
      upcoming += 1;
    }
    if (!lastSessionAt || sess.scheduled_datetime > lastSessionAt) {
      lastSessionAt = sess.scheduled_datetime;
    }
  }

  return buildProfile(
    yw,
    parent,
    athletePhone,
    uniqueSessionIds.length,
    completed,
    upcoming,
    lastSessionAt
  );
}

function buildProfile(
  yw: Record<string, unknown>,
  parent: CoachWrestlerProfile['parent'],
  athletePhone: string | null,
  sessionsWithCoach: number,
  completedWithCoach: number,
  upcomingWithCoach: number,
  lastSessionAt: string | null
): CoachWrestlerProfile {
  const gradYear = (yw.graduation_year as number | null) ?? null;
  return {
    id: yw.id as string,
    firstName: (yw.first_name as string) ?? '',
    lastName: (yw.last_name as string) ?? '',
    photoUrl: (yw.photo_url as string | null) ?? null,
    photoFocusX: (yw.photo_focus_x as number | null) ?? null,
    photoFocusY: (yw.photo_focus_y as number | null) ?? null,
    age: (yw.age as number | null) ?? null,
    weightClass: formatWeightClassLabel((yw.weight_class as string | null) ?? null),
    skillLevel: formatSkillLevelLabel((yw.skill_level as string | null) ?? null),
    graduationYear: formatGraduationYearLabel(gradYear),
    school: (yw.school as string | null) ?? null,
    athletePhone,
    parent,
    sessionsWithCoach,
    completedWithCoach,
    upcomingWithCoach,
    lastSessionAt,
  };
}
