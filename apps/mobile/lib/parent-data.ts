import { apiFetch } from './api';
import { supabase } from './supabase';

export type MobileCoach = {
  id: string;
  first_name: string;
  last_name: string;
  school: string | null;
  photo_url: string | null;
  average_rating: number | null;
  review_count: number | null;
};

export type MobileBooking = {
  id: string;
  scheduled_datetime: string;
  status: string;
  focus_area: string | null;
  session_type: string | null;
  coach: {
    first_name: string;
    last_name: string;
    school: string;
  } | null;
  facility: { name: string } | null;
};

export type OpenSmallGroupSession = {
  id: string;
  scheduled_datetime: string;
  focus_area: string | null;
  current_participants: number | null;
  max_participants: number | null;
  price_per_participant: number | null;
  total_price: number | null;
  coach: {
    id: string;
    first_name: string;
    last_name: string;
    school: string | null;
    photo_url: string | null;
  } | null;
  facility: { name: string; address: string | null } | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Upcoming joinable small groups (primary parent product). */
export async function fetchOpenSmallGroupSessions(): Promise<OpenSmallGroupSession[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('sessions')
    .select(
      `
      id,
      scheduled_datetime,
      focus_area,
      current_participants,
      max_participants,
      price_per_participant,
      total_price,
      athletes(id, first_name, last_name, school, photo_url),
      facilities(name, address)
    `
    )
    .in('session_type', ['group', 'small_group'])
    .eq('status', 'scheduled')
    .in('join_policy', ['public', 'invite_only'])
    .gte('scheduled_datetime', now)
    .order('scheduled_datetime', { ascending: true })
    .limit(40);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((s) => {
      const coach = unwrapOne(
        s.athletes as
          | {
              id: string;
              first_name: string;
              last_name: string;
              school: string | null;
              photo_url: string | null;
            }
          | {
              id: string;
              first_name: string;
              last_name: string;
              school: string | null;
              photo_url: string | null;
            }[]
          | null
      );
      const facility = unwrapOne(
        s.facilities as
          | { name: string; address: string | null }
          | { name: string; address: string | null }[]
          | null
      );
      return {
        id: s.id,
        scheduled_datetime: s.scheduled_datetime,
        focus_area: s.focus_area,
        current_participants: s.current_participants,
        max_participants: s.max_participants,
        price_per_participant: s.price_per_participant,
        total_price: s.total_price,
        coach,
        facility,
      };
    })
    .filter((s) => {
      const max = s.max_participants ?? 0;
      const cur = s.current_participants ?? 0;
      return max === 0 || cur < max;
    });
}

async function getFamilyYouthWrestlerIds(userId: string): Promise<string[]> {
  const [primaryRes, linkedRes, selfRes] = await Promise.all([
    supabase.from('youth_wrestlers').select('id').eq('parent_id', userId),
    supabase.from('youth_wrestler_parents').select('youth_wrestler_id').eq('parent_id', userId),
    supabase.from('youth_wrestlers').select('id').eq('id', userId).maybeSingle(),
  ]);
  const ids = [
    ...(primaryRes.data ?? []).map((r: { id: string }) => r.id),
    ...(linkedRes.data ?? []).map((r: { youth_wrestler_id: string }) => r.youth_wrestler_id),
  ];
  if (selfRes.data) ids.push(userId);
  return [...new Set(ids)];
}

/** Active coaches — same source as web browse (works without deploying /api/mobile). */
export async function fetchActiveCoaches(): Promise<MobileCoach[]> {
  const { data, error } = await supabase
    .from('athletes')
    .select('id, first_name, last_name, school, photo_url, average_rating, review_count')
    .eq('active', true)
    .order('school', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as MobileCoach[];
}

/** Family bookings — mirrors /api/mobile/bookings without needing that route deployed. */
export async function fetchFamilyBookings(userId: string): Promise<MobileBooking[]> {
  const youthIds = await getFamilyYouthWrestlerIds(userId);
  if (youthIds.length === 0) return [];

  const { data: partRows, error: partErr } = await supabase
    .from('session_participants')
    .select('session_id')
    .in('youth_wrestler_id', youthIds);
  if (partErr) throw new Error(partErr.message);

  const sessionIds = [...new Set((partRows ?? []).map((r: { session_id: string }) => r.session_id))];
  if (sessionIds.length === 0) return [];

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select(
      `
      id,
      scheduled_datetime,
      status,
      focus_area,
      session_type,
      athletes(first_name, last_name, school),
      facilities(name)
    `
    )
    .in('id', sessionIds)
    .order('scheduled_datetime', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (sessions ?? []).map((s) => {
    const coach = unwrapOne(
      s.athletes as
        | { first_name: string; last_name: string; school: string }
        | { first_name: string; last_name: string; school: string }[]
        | null
    );
    const facility = unwrapOne(
      s.facilities as { name: string } | { name: string }[] | null
    );
    return {
      id: s.id,
      scheduled_datetime: s.scheduled_datetime,
      status: s.status,
      focus_area: s.focus_area,
      session_type: (s.session_type as string | null) ?? null,
      coach: coach
        ? {
            first_name: coach.first_name,
            last_name: coach.last_name,
            school: coach.school,
          }
        : null,
      facility: facility ? { name: facility.name } : null,
    };
  });
}

export type RosterParticipant = {
  name: string;
  age?: number | null;
  weightClass?: string | null;
  skillLevel?: string | null;
  graduationYear?: number | null;
};

export type SessionDetail = {
  id: string;
  scheduled_datetime: string;
  duration_minutes: number | null;
  status: string;
  session_type: string | null;
  focus_area: string | null;
  focus_area_2: string | null;
  join_policy: string | null;
  max_participants: number | null;
  price_per_participant: number | null;
  total_price: number | null;
  filled_count: number;
  openings: number;
  coach: {
    id: string;
    first_name: string;
    last_name: string;
    school: string | null;
    photo_url: string | null;
    average_rating: number | null;
    review_count: number | null;
  } | null;
  facility: {
    id: string;
    name: string;
    address: string | null;
    address_hidden?: boolean;
  } | null;
};

/** Session detail + who's on the roster (server route uses admin client past RLS). */
export async function fetchSessionDetail(
  sessionId: string
): Promise<{ session: SessionDetail; roster: RosterParticipant[] }> {
  return apiFetch<{ session: SessionDetail; roster: RosterParticipant[] }>(
    `/api/mobile/sessions/${sessionId}`
  );
}

export function sessionTypeLabel(sessionType: string | null | undefined): string {
  if (!sessionType) return 'Session';
  if (sessionType === 'group' || sessionType === 'small_group') return 'Small group';
  if (sessionType === '2-athlete' || sessionType === 'partner') return 'Partner';
  if (sessionType === '1-on-1' || sessionType === 'private') return 'Private';
  return sessionType;
}
