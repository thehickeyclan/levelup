import type { SupabaseClient } from '@supabase/supabase-js';

export type MobileCoachAthleteSession = {
  id: string;
  scheduledDatetime: string;
  status: string;
  sessionType: string | null;
  focusArea: string | null;
  facilityName: string | null;
};

export type MobileCoachAthlete = {
  id: string;
  parentId: string | null;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  age: number | null;
  weightClass: string | null;
  skillLevel: string | null;
  graduationYear: number | null;
  school: string | null;
  sessionsWithCoach: number;
  completedGuildSessions: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  history: MobileCoachAthleteSession[];
};

type SessionRow = {
  id: string;
  scheduled_datetime: string;
  status: string;
  session_type?: string | null;
  focus_area?: string | null;
  facilities?: { name?: string | null } | { name?: string | null }[] | null;
};

type YouthProfile = {
  id: string;
  parent_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
  age?: number | null;
  date_of_birth?: string | null;
  weight_class?: string | null;
  skill_level?: string | null;
  graduation_year?: number | null;
  school?: string | null;
};

type ParticipantRow = {
  session_id: string;
  attendance_status?: 'attended' | 'no_show' | null;
  youth_wrestler_id?: string | null;
  parent_id?: string | null;
  paid?: boolean | null;
  roster_first_name?: string | null;
  roster_last_name?: string | null;
  roster_photo_url?: string | null;
  youth_wrestlers?: YouthProfile | YouthProfile[] | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function ageFromBirthDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 100 ? age : null;
}

function isCompletedTraining(session: SessionRow, nowMs: number): boolean {
  if (
    session.status === 'cancelled' ||
    session.status === 'pending_payment' ||
    session.status === 'no-show'
  ) {
    return false;
  }
  if (session.status === 'completed') return true;
  const scheduled = new Date(session.scheduled_datetime).getTime();
  return Number.isFinite(scheduled) && scheduled < nowMs;
}

/**
 * Every athlete registered for this coach, enriched with coach-specific history and
 * completed Guild-session totals. Verified no-shows are excluded; historical rows with
 * no attendance record retain the legacy registration-derived behavior.
 */
export async function fetchMobileCoachAthletes(
  admin: SupabaseClient,
  coachId: string,
  athleteId?: string | null
): Promise<MobileCoachAthlete[]> {
  const { data: coachSessionsRaw, error: sessionError } = await admin
    .from('sessions')
    .select(
      'id, scheduled_datetime, status, session_type, focus_area, facilities(name)'
    )
    .eq('athlete_id', coachId)
    .order('scheduled_datetime', { ascending: false });
  if (sessionError) throw new Error(sessionError.message);

  const coachSessions = (coachSessionsRaw ?? []) as SessionRow[];
  const coachSessionIds = coachSessions.map((session) => session.id);
  if (coachSessionIds.length === 0) return [];

  let participantQuery = admin
    .from('session_participants')
    .select(
      `
      session_id,
      attendance_status,
      youth_wrestler_id,
      parent_id,
      paid,
      roster_first_name,
      roster_last_name,
      roster_photo_url,
      youth_wrestlers(
        id,
        parent_id,
        first_name,
        last_name,
        photo_url,
        age,
        date_of_birth,
        weight_class,
        skill_level,
        graduation_year,
        school
      )
    `
    )
    .in('session_id', coachSessionIds);
  if (athleteId) participantQuery = participantQuery.eq('youth_wrestler_id', athleteId);

  const { data: coachParticipantsRaw, error: participantError } = await participantQuery;
  if (participantError) throw new Error(participantError.message);
  const coachParticipants = (coachParticipantsRaw ?? []) as ParticipantRow[];

  const athleteIds = [
    ...new Set(
      coachParticipants
        .map((participant) => participant.youth_wrestler_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (athleteIds.length === 0) return [];

  const { data: allParticipantRowsRaw, error: allParticipantError } = await admin
    .from('session_participants')
    .select('session_id, youth_wrestler_id, paid, attendance_status')
    .in('youth_wrestler_id', athleteIds);
  if (allParticipantError) throw new Error(allParticipantError.message);
  const allParticipantRows = (allParticipantRowsRaw ?? []) as ParticipantRow[];
  const allSessionIds = [
    ...new Set(allParticipantRows.map((row) => row.session_id).filter(Boolean)),
  ];

  const { data: allSessionsRaw, error: allSessionsError } =
    allSessionIds.length > 0
      ? await admin
          .from('sessions')
          .select('id, scheduled_datetime, status')
          .in('id', allSessionIds)
      : { data: [] as SessionRow[], error: null };
  if (allSessionsError) throw new Error(allSessionsError.message);

  const nowMs = Date.now();
  const coachSessionById = new Map(coachSessions.map((session) => [session.id, session]));
  const allSessionById = new Map(
    ((allSessionsRaw ?? []) as SessionRow[]).map((session) => [session.id, session])
  );
  const guildCompletedByAthlete = new Map<string, Set<string>>();

  for (const participant of allParticipantRows) {
    const wrestlerId = participant.youth_wrestler_id;
    const session = allSessionById.get(participant.session_id);
    if (
      !wrestlerId ||
      !session ||
      participant.attendance_status === 'no_show' ||
      !isCompletedTraining(session, nowMs)
    ) {
      continue;
    }
    let ids = guildCompletedByAthlete.get(wrestlerId);
    if (!ids) {
      ids = new Set();
      guildCompletedByAthlete.set(wrestlerId, ids);
    }
    ids.add(session.id);
  }

  type AthleteAggregate = {
    profile: YouthProfile;
    parentId: string | null;
    fallbackFirstName: string;
    fallbackLastName: string;
    fallbackPhotoUrl: string | null;
    coachSessionIds: Set<string>;
  };

  const byAthlete = new Map<string, AthleteAggregate>();
  const coachAttendanceByAthleteSession = new Map<string, ParticipantRow['attendance_status']>();
  for (const participant of coachParticipants) {
    const wrestlerId = participant.youth_wrestler_id;
    if (!wrestlerId) continue;
    coachAttendanceByAthleteSession.set(
      `${wrestlerId}:${participant.session_id}`,
      participant.attendance_status
    );
    const profile = unwrapOne(participant.youth_wrestlers);
    const existing = byAthlete.get(wrestlerId);
    if (existing) {
      existing.coachSessionIds.add(participant.session_id);
      continue;
    }
    byAthlete.set(wrestlerId, {
      profile: profile ?? { id: wrestlerId },
      parentId: participant.parent_id ?? profile?.parent_id ?? null,
      fallbackFirstName: participant.roster_first_name ?? '',
      fallbackLastName: participant.roster_last_name ?? '',
      fallbackPhotoUrl: participant.roster_photo_url ?? null,
      coachSessionIds: new Set([participant.session_id]),
    });
  }

  const athletes: MobileCoachAthlete[] = [];
  for (const [id, aggregate] of byAthlete) {
    const history = [...aggregate.coachSessionIds]
      .map((sessionId) => coachSessionById.get(sessionId))
      .filter((session): session is SessionRow => Boolean(session))
      .map((session) => ({
        id: session.id,
        scheduledDatetime: session.scheduled_datetime,
        status: session.status,
        sessionType: session.session_type ?? null,
        focusArea: session.focus_area ?? null,
        facilityName: unwrapOne(session.facilities)?.name ?? null,
      }));
    const completedWithCoach = history.filter(
      (session) =>
        coachAttendanceByAthleteSession.get(`${id}:${session.id}`) !== 'no_show' &&
        isCompletedTraining(
          {
            id: session.id,
            scheduled_datetime: session.scheduledDatetime,
            status: session.status,
          },
          nowMs
        )
    );
    const upcoming = history
      .filter(
        (session) =>
          session.status === 'scheduled' &&
          new Date(session.scheduledDatetime).getTime() >= nowMs
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledDatetime).getTime() - new Date(b.scheduledDatetime).getTime()
      );
    const past = completedWithCoach.sort(
      (a, b) =>
        new Date(b.scheduledDatetime).getTime() - new Date(a.scheduledDatetime).getTime()
    );
    const profile = aggregate.profile;
    athletes.push({
      id,
      parentId: aggregate.parentId,
      firstName: profile.first_name ?? aggregate.fallbackFirstName,
      lastName: profile.last_name ?? aggregate.fallbackLastName,
      photoUrl: profile.photo_url ?? aggregate.fallbackPhotoUrl,
      age: profile.age ?? ageFromBirthDate(profile.date_of_birth),
      weightClass: profile.weight_class ?? null,
      skillLevel: profile.skill_level ?? null,
      graduationYear: profile.graduation_year ?? null,
      school: profile.school ?? null,
      sessionsWithCoach: completedWithCoach.length,
      completedGuildSessions: guildCompletedByAthlete.get(id)?.size ?? 0,
      lastSessionAt: past[0]?.scheduledDatetime ?? null,
      nextSessionAt: upcoming[0]?.scheduledDatetime ?? null,
      history,
    });
  }

  return athletes.sort((a, b) => {
    if (a.lastSessionAt !== b.lastSessionAt) {
      return (b.lastSessionAt ?? '').localeCompare(a.lastSessionAt ?? '');
    }
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
  });
}
