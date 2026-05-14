import { createAdminClient } from '@/lib/supabase/admin';
import { fetchCoachReviewStatsMap, getCoachReviewStatsForId } from '@/lib/coach-review-stats';
import { isSessionOpenForParentBrowse } from '@/lib/sessions';

export type SessionKind = 'private' | 'partner' | 'small_group';

/** Why the map might show zero pins (for empty-state copy). */
export type CoachMapStats = {
  facilitiesWithCoordinates: number;
  /** Coaches whose primary facility (`athletes.facility_id`) has latitude/longitude. */
  coachesLinkedToGeocodedFacilities: number;
};

export type CoachMapPin = {
  pinKey: string;
  coachId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  school: string;
  year: string | null;
  weightClass: string | null;
  averageRating: number | null;
  reviewCount: number;
  facilityId: string;
  facilityName: string;
  facilityAddress: string | null;
  latitude: number;
  longitude: number;
  nextSessionAt: string | null;
  sessionKinds: SessionKind[];
  hasOpenSession: boolean;
  /** Weekly hours and/or future dated slots in the app — parents schedule from this, not only pre-built sessions. */
  hasPublishedAvailability: boolean;
};

function normalizeSessionKind(sessionType: string | null | undefined): SessionKind | null {
  if (!sessionType) return null;
  const t = sessionType.toLowerCase();
  if (t === '1-on-1' || t === 'private') return 'private';
  if (t === '2-athlete' || t === 'partner') return 'partner';
  if (t === 'group' || t === 'small_group') return 'small_group';
  return null;
}

function coachHasOpenUpcomingSession(
  rows: Array<{
    status?: string | null;
    scheduled_datetime?: string;
    join_policy?: string | null;
    current_participants?: number | null;
    max_participants?: number | null;
    session_participants?: unknown[] | null;
  }>
): boolean {
  const now = Date.now();
  for (const s of rows) {
    if (!s.scheduled_datetime) continue;
    if (new Date(s.scheduled_datetime).getTime() <= now) continue;
    if (!isSessionOpenForParentBrowse(s)) continue;
    const jp = s.join_policy ?? '';
    if (jp !== 'public' && jp !== 'invite_only') continue;
    return true;
  }
  return false;
}

export async function fetchCoachMapPins(
  tenantSlug: string
): Promise<
  | { ok: true; pins: CoachMapPin[]; cities: string[]; stats: CoachMapStats }
  | { ok: false; error: string }
> {
  try {
  const admin = createAdminClient(tenantSlug);

  const { data: facilities, error: facErr } = await admin
    .from('facilities')
    .select('id, name, address, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (facErr) {
    console.error('[fetchCoachMapPins] facilities', facErr);
    return { ok: false, error: 'Failed to load facilities' };
  }

  const facilityIds = new Set((facilities ?? []).map((f) => f.id));
  const facilitiesWithCoordinates = facilities?.length ?? 0;
  if (facilityIds.size === 0) {
    return {
      ok: true,
      pins: [],
      cities: [],
      stats: { facilitiesWithCoordinates: 0, coachesLinkedToGeocodedFacilities: 0 },
    };
  }

  // Include approved coaches (active) and pending applications (active=false, status=pending)
  // so the regional map reflects everyone tied to a geocoded facility — see coach-application-signup.
  const { data: coaches, error: coachErr } = await admin
    .from('athletes')
    .select(
      'id, first_name, last_name, photo_url, school, year, weight_class, average_rating, review_count, facility_id'
    )
    .neq('status', 'rejected')
    .neq('status', 'suspended')
    .or('active.eq.true,status.eq.pending');

  if (coachErr) {
    console.error('[fetchCoachMapPins] athletes', coachErr);
    return { ok: false, error: 'Failed to load coaches' };
  }

  const skipTableErr = (err: { message?: string; code?: string } | null) =>
    err && (err.message?.includes('does not exist') || err.code === '42P01');

  /** Pins use primary facility only (`athletes.facility_id`). Secondary / coach_facilities still apply on Training & booking. */
  let coachesLinkedToGeocodedFacilities = 0;
  const coachIds: string[] = [];
  for (const c of coaches ?? []) {
    const pid = c.facility_id as string | null | undefined;
    if (pid && facilityIds.has(pid)) {
      coachesLinkedToGeocodedFacilities += 1;
      coachIds.push(c.id as string);
    }
  }

  const sessionByCoach = new Map<
    string,
    Array<{
      session_type: string | null;
      scheduled_datetime: string;
      status: string | null;
      join_policy: string | null;
      current_participants: number | null;
      max_participants: number | null;
    }>
  >();

  const reviewStatsMap = await fetchCoachReviewStatsMap(admin, coachIds);

  const coachIdsWithPublishedAvailability = new Set<string>();
  if (coachIds.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const [weeklyRes, slotsRes] = await Promise.all([
      admin.from('athlete_availability').select('athlete_id').in('athlete_id', coachIds),
      admin
        .from('athlete_availability_slots')
        .select('athlete_id')
        .in('athlete_id', coachIds)
        .gte('slot_date', today),
    ]);
    if (weeklyRes.error && !skipTableErr(weeklyRes.error)) {
      console.error('[fetchCoachMapPins] athlete_availability', weeklyRes.error);
    } else {
      for (const r of weeklyRes.data ?? []) {
        const id = r.athlete_id as string;
        if (id) coachIdsWithPublishedAvailability.add(id);
      }
    }
    if (slotsRes.error && !skipTableErr(slotsRes.error)) {
      console.error('[fetchCoachMapPins] athlete_availability_slots', slotsRes.error);
    } else {
      for (const r of slotsRes.data ?? []) {
        const id = r.athlete_id as string;
        if (id) coachIdsWithPublishedAvailability.add(id);
      }
    }
  }

  if (coachIds.length > 0) {
    const { data: sessions, error: sessErr } = await admin
      .from('sessions')
      .select(
        'athlete_id, session_type, scheduled_datetime, status, join_policy, current_participants, max_participants'
      )
      .in('athlete_id', coachIds)
      .eq('status', 'scheduled')
      .gt('scheduled_datetime', new Date().toISOString());

    if (sessErr) {
      console.error('[fetchCoachMapPins] sessions', sessErr);
    } else {
      for (const s of sessions ?? []) {
        const aid = s.athlete_id as string;
        const list = sessionByCoach.get(aid) ?? [];
        list.push({
          session_type: s.session_type as string | null,
          scheduled_datetime: s.scheduled_datetime as string,
          status: s.status as string | null,
          join_policy: s.join_policy as string | null,
          current_participants: s.current_participants as number | null,
          max_participants: s.max_participants as number | null,
        });
        sessionByCoach.set(aid, list);
      }
    }
  }

  const facById = new Map((facilities ?? []).map((f) => [f.id, f]));

  const pins: CoachMapPin[] = [];
  const citySet = new Set<string>();

  for (const c of coaches ?? []) {
    const sessions = sessionByCoach.get(c.id as string) ?? [];
    const kindsSet = new Set<SessionKind>();
    let nextAt: string | null = null;
    for (const s of sessions) {
      const kind = normalizeSessionKind(s.session_type);
      if (kind) kindsSet.add(kind);
    }
    for (const s of sessions) {
      if (!isSessionOpenForParentBrowse(s)) continue;
      const jp = s.join_policy ?? '';
      if (jp !== 'public' && jp !== 'invite_only') continue;
      const t = new Date(s.scheduled_datetime).getTime();
      if (nextAt === null || t < new Date(nextAt).getTime()) {
        nextAt = s.scheduled_datetime;
      }
    }
    const sessionKinds = Array.from(kindsSet);
    const hasOpenSession = coachHasOpenUpcomingSession(sessions);
    const hasPublishedAvailability = coachIdsWithPublishedAvailability.has(c.id as string);

    const addPin = (fid: string) => {
      const f = facById.get(fid);
      if (!f || f.latitude == null || f.longitude == null) return;
      const addr = (f.address as string | null) ?? null;
      if (addr) {
        const part = addr.split(',')[0]?.trim();
        if (part) citySet.add(part);
      }
      const rev = getCoachReviewStatsForId(reviewStatsMap, c.id as string);
      pins.push({
        pinKey: `${c.id}:${fid}`,
        coachId: c.id as string,
        firstName: c.first_name as string,
        lastName: c.last_name as string,
        photoUrl: (c.photo_url as string | null) ?? null,
        school: c.school as string,
        year: (c.year as string | null) ?? null,
        weightClass: (c.weight_class as string | null) ?? null,
        averageRating:
          rev.review_count > 0 ? Number(rev.average_rating.toFixed(1)) : null,
        reviewCount: rev.review_count,
        facilityId: f.id as string,
        facilityName: f.name as string,
        facilityAddress: addr,
        latitude: Number(f.latitude),
        longitude: Number(f.longitude),
        nextSessionAt: nextAt,
        sessionKinds,
        hasOpenSession,
        hasPublishedAvailability,
      });
    };

    const primaryId = c.facility_id as string | null | undefined;
    if (primaryId && facilityIds.has(primaryId)) addPin(primaryId);
  }

  const cities = Array.from(citySet).sort((a, b) => a.localeCompare(b));

  return {
    ok: true,
    pins,
    cities,
    stats: {
      facilitiesWithCoordinates,
      coachesLinkedToGeocodedFacilities,
    },
  };
  } catch (e) {
    console.error('[fetchCoachMapPins]', e);
    return { ok: false, error: 'Failed to load map data' };
  }
}
