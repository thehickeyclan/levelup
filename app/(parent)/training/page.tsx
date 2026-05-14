import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { addDays, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { APP_TIMEZONE, formatEST } from '@/lib/format-date';
import type { CoachDateFilterData } from '@/lib/training-coach-date-filter';
import { Athlete } from '@/types';
import { TrainingClient } from './training-client';
import {
  fetchCoachReviewStatsMap,
  mergeCoachReviewStatsIntoAthlete,
  patchSessionsWithCoachReviewStats,
  sortAthletesForBrowse,
} from '@/lib/coach-review-stats';
import { isSessionOpenForParentBrowse } from '@/lib/sessions';
import { buildServiceTypesByCoach } from '@/lib/coach-offered-session-types';

export const metadata = {
  title: 'Training | The Guild',
  description: 'Find and book sessions. Filter by day, time, facility, and coach.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SessionRow = {
  id: string;
  scheduled_datetime: string;
  status?: string | null;
  session_type: string | null;
  session_mode: string | null;
  join_policy?: string | null;
  focus_area: string | null;
  current_participants: number | null;
  max_participants: number | null;
  total_price: number | null;
  price_per_participant: number | null;
  athlete_id: string;
  facility_id: string;
  athletes?: { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string; average_rating?: number; review_count?: number } | null;
  facilities?: { id: string; name?: string; address?: string } | null;
  session_participants?: Array<{
    id: string;
    youth_wrestler_id: string | null;
    youth_wrestlers?: { id: string; first_name?: string; last_name?: string } | null;
  }>;
};

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string; time?: string; location?: string; coach?: string; wrestler?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === 'sessions' ? 'sessions' : 'coaches';

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const admin = createAdminClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role === 'coach') redirect('/athlete-dashboard');
  if (userData?.role !== 'parent' && userData?.role !== 'admin' && userData?.role !== 'youth_wrestler') redirect('/dashboard');

  /** Match client grid sort on first paint (avoids followed coaches jumping after /api/coach-follows loads). */
  let initialFollowedCoachIds: string[] = [];
  if (userData?.role === 'parent' || userData?.role === 'admin') {
    const { data: followRows } = await supabase
      .from('coach_follows')
      .select('coach_id')
      .eq('parent_id', user.id);
    initialFollowedCoachIds = [
      ...new Set((followRows ?? []).map((r: { coach_id: string }) => r.coach_id).filter(Boolean)),
    ];
  }

  // Fetch parent's wrestlers for "Booked" state check
  const { data: parentWrestlers } = await supabase
    .from('youth_wrestlers')
    .select('id')
    .eq('parent_id', user.id);
  const parentWrestlerIds = (parentWrestlers || []).map((w) => w.id);

  const { data: facilities } = await supabase
    .from('facilities')
    .select('id, name, school, address')
    .order('name');

  const { data: athletes } = await supabase
    .from('athletes')
    .select('*')
    .eq('active', true)
    .order('average_rating', { ascending: false, nullsFirst: true })
    .order('school', { ascending: true });

  const athletesList = (athletes || []) as Athlete[];
  const athleteIds = athletesList.map((a) => a.id);

  type CoachFacilityRow = { coach_id: string; facility_id: string };
  let coachFacilityRows: CoachFacilityRow[] = [];
  if (athleteIds.length > 0) {
    const { data: cfData } = await admin
      .from('coach_facilities')
      .select('coach_id, facility_id')
      .in('coach_id', athleteIds);
    coachFacilityRows = (cfData ?? []) as CoachFacilityRow[];
  }
  /** Junction can be partially filled — always union primary + secondary athletes columns (matches map/booking logic). */
  const pairSeen = new Set(coachFacilityRows.map((r) => `${r.coach_id}:${r.facility_id}`));
  for (const a of athletesList) {
    if (a.facility_id && !pairSeen.has(`${a.id}:${a.facility_id}`)) {
      coachFacilityRows.push({ coach_id: a.id, facility_id: a.facility_id });
      pairSeen.add(`${a.id}:${a.facility_id}`);
    }
    if (
      a.secondary_facility_id &&
      a.secondary_facility_id !== a.facility_id &&
      !pairSeen.has(`${a.id}:${a.secondary_facility_id}`)
    ) {
      coachFacilityRows.push({ coach_id: a.id, facility_id: a.secondary_facility_id });
      pairSeen.add(`${a.id}:${a.secondary_facility_id}`);
    }
  }
  const activeCoachIdSet = new Set(athleteIds);
  coachFacilityRows = coachFacilityRows.filter((r) => activeCoachIdSet.has(r.coach_id));

  const distinctCoachFacilityIds = [...new Set(coachFacilityRows.map((r) => r.facility_id))];
  const { data: coachFilterFacilityRows } = distinctCoachFacilityIds.length
    ? await admin
        .from('facilities')
        .select('id, name')
        .in('id', distinctCoachFacilityIds)
        .order('name', { ascending: true })
    : { data: [] };

  const coachIdsByFacilityId: Record<string, string[]> = {};
  for (const r of coachFacilityRows) {
    const list = coachIdsByFacilityId[r.facility_id] ?? [];
    list.push(r.coach_id);
    coachIdsByFacilityId[r.facility_id] = list;
  }
  for (const fid of Object.keys(coachIdsByFacilityId)) {
    coachIdsByFacilityId[fid] = [...new Set(coachIdsByFacilityId[fid])];
  }
  const coachFilterLocations = (coachFilterFacilityRows ?? []).map((f: { id: string; name: string }) => ({
    id: f.id,
    name: f.name,
  }));

  /** Coaches tab: optional date filter (Eastern calendar) — next ~120 days of index data. */
  const nowIso = new Date().toISOString();
  const todayEastern = formatEST(new Date(), 'yyyy-MM-dd');
  const coachDateHorizonEnd = formatEST(addDays(parseISO(todayEastern), 120), 'yyyy-MM-dd');
  const horizonUtcEnd = new Date(Date.now() + 130 * 86400000).toISOString();

  const { data: pubSessionsForDateFilter } = athleteIds.length
    ? await supabase
        .from('sessions')
        .select(
          `athlete_id, scheduled_datetime, join_policy, status, current_participants, max_participants, session_participants(id)`
        )
        .in('athlete_id', athleteIds)
        .eq('join_policy', 'public')
        .eq('status', 'scheduled')
        .gte('scheduled_datetime', nowIso)
        .lte('scheduled_datetime', horizonUtcEnd)
    : { data: [] };

  const openPublicCoachIdsByDate: Record<string, string[]> = {};
  const pubDateSets = new Map<string, Set<string>>();
  for (const row of pubSessionsForDateFilter ?? []) {
    if (!isSessionOpenForParentBrowse(row as Parameters<typeof isSessionOpenForParentBrowse>[0])) continue;
    const r = row as { athlete_id: string; scheduled_datetime: string };
    const dateKey = formatEST(r.scheduled_datetime, 'yyyy-MM-dd');
    if (dateKey < todayEastern || dateKey > coachDateHorizonEnd) continue;
    if (!pubDateSets.has(dateKey)) pubDateSets.set(dateKey, new Set());
    pubDateSets.get(dateKey)!.add(r.athlete_id);
  }
  for (const [k, set] of pubDateSets) openPublicCoachIdsByDate[k] = [...set];

  const { data: weeklyAvailRows } = athleteIds.length
    ? await supabase.from('athlete_availability').select('athlete_id, day_of_week').in('athlete_id', athleteIds)
    : { data: [] };
  const weeklyDowByCoach: Record<string, number[]> = {};
  for (const r of weeklyAvailRows ?? []) {
    const row = r as { athlete_id: string; day_of_week: number };
    const list = weeklyDowByCoach[row.athlete_id] ?? [];
    if (!list.includes(row.day_of_week)) list.push(row.day_of_week);
    weeklyDowByCoach[row.athlete_id] = list;
  }

  const { data: slotRowsHorizon } = athleteIds.length
    ? await supabase
        .from('athlete_availability_slots')
        .select('athlete_id, slot_date')
        .in('athlete_id', athleteIds)
        .gte('slot_date', todayEastern)
        .lte('slot_date', coachDateHorizonEnd)
    : { data: [] };
  const slotDatesByCoach: Record<string, string[]> = {};
  for (const r of slotRowsHorizon ?? []) {
    const row = r as { athlete_id: string; slot_date: string };
    const list = slotDatesByCoach[row.athlete_id] ?? [];
    if (!list.includes(row.slot_date)) list.push(row.slot_date);
    slotDatesByCoach[row.athlete_id] = list;
  }

  const { data: blockRowsHorizon } = athleteIds.length
    ? await supabase
        .from('athlete_availability_blocks')
        .select('athlete_id, blocked_date')
        .in('athlete_id', athleteIds)
        .gte('blocked_date', todayEastern)
        .lte('blocked_date', coachDateHorizonEnd)
    : { data: [] };
  const blockedDatesByCoach: Record<string, string[]> = {};
  for (const r of blockRowsHorizon ?? []) {
    const row = r as { athlete_id: string; blocked_date: string };
    const list = blockedDatesByCoach[row.athlete_id] ?? [];
    const bd = String(row.blocked_date).slice(0, 10);
    if (!list.includes(bd)) list.push(bd);
    blockedDatesByCoach[row.athlete_id] = list;
  }

  const coachDateFilterData: CoachDateFilterData = {
    openPublicCoachIdsByDate,
    weeklyDowByCoach,
    slotDatesByCoach,
    blockedDatesByCoach,
  };
  const coachDateFilterBounds = { minYmd: todayEastern, maxYmd: coachDateHorizonEnd };

  const reviewStatsMap = await fetchCoachReviewStatsMap(supabase, athleteIds);
  const athletesMerged = sortAthletesForBrowse(
    athletesList.map((a) => mergeCoachReviewStatsIntoAthlete(a, reviewStatsMap))
  );

  const today = new Date().toISOString().slice(0, 10);
  const { data: slots } = athleteIds.length
    ? await supabase
        .from('athlete_availability_slots')
        .select('athlete_id, slot_date, start_time')
        .in('athlete_id', athleteIds)
        .gte('slot_date', today)
        .order('slot_date', { ascending: true })
        .order('start_time', { ascending: true })
    : { data: [] };

  const nextByAthlete = new Map<string, { slot_date: string; start_time: string }>();
  for (const row of slots ?? []) {
    const r = row as { athlete_id: string; slot_date: string; start_time: string };
    if (!nextByAthlete.has(r.athlete_id)) nextByAthlete.set(r.athlete_id, { slot_date: r.slot_date, start_time: r.start_time });
  }

  // Fallback: coaches with no availability slots — use their earliest upcoming session (e.g. small group)
  const { data: upcomingSessions } = athleteIds.length
    ? await supabase
        .from('sessions')
        .select('athlete_id, scheduled_datetime')
        .in('athlete_id', athleteIds)
        .eq('status', 'scheduled')
        .gte('scheduled_datetime', nowIso)
        .order('scheduled_datetime', { ascending: true })
    : { data: [] };
  for (const row of upcomingSessions ?? []) {
    const r = row as { athlete_id: string; scheduled_datetime: string };
    if (nextByAthlete.has(r.athlete_id)) continue;
    const zoned = toZonedTime(new Date(r.scheduled_datetime), APP_TIMEZONE);
    const y = zoned.getFullYear();
    const m = zoned.getMonth() + 1;
    const day = zoned.getDate();
    const slotDate = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const startTime = `${String(zoned.getHours()).padStart(2, '0')}:${String(zoned.getMinutes()).padStart(2, '0')}`;
    nextByAthlete.set(r.athlete_id, { slot_date: slotDate, start_time: startTime });
  }

  const athletesWithNext = athletesMerged.map((a) => ({
    ...a,
    nextAvailable: nextByAthlete.get(a.id) ?? null,
  }));

  // Sessions list: smart default = next 14 days when no date; optional filters for facility/coach/time
  let availabilitySessions: SessionRow[] = [];
  const dateParam = sp.date;
  const now = new Date();
  const dayStart = dateParam
    ? (() => {
        const d = new Date(dateParam);
        if (Number.isNaN(d.getTime())) return now.toISOString();
        const dateOnly = dateParam.split('T')[0];
        return `${dateOnly}T00:00:00.000Z`;
      })()
    : now.toISOString();
  const dayEnd = dateParam
    ? (() => {
        const d = new Date(dateParam);
        if (Number.isNaN(d.getTime())) return now.toISOString();
        const dateOnly = dateParam.split('T')[0];
        return `${dateOnly}T23:59:59.999Z`;
      })()
    : (() => {
        const end = new Date(now);
        end.setDate(end.getDate() + 14);
        return end.toISOString();
      })();
  // Past/completed sessions: when no date = last 14 days; when date = that day
  const pastDayStart = dateParam
    ? dayStart
    : (() => {
        const start = new Date(now);
        start.setDate(start.getDate() - 14);
        return start.toISOString();
      })();
  const pastDayEnd = dateParam ? dayEnd : now.toISOString();

  // Query sessions - use simple select first, then join coach/facility data
  const baseSelect = `
    id, scheduled_datetime, status, session_type, session_mode, join_policy, focus_area,
    current_participants, max_participants, total_price, price_per_participant, duration_minutes,
    athlete_id, facility_id,
    athletes:athlete_id(id, first_name, last_name, school, photo_url, average_rating, review_count),
    facilities:facility_id(id, name, address),
    session_participants(id, youth_wrestler_id, youth_wrestlers:youth_wrestler_id(id, first_name, last_name))
  `;
  const sessionQuery = (start: string, end: string) =>
    supabase.from('sessions').select(baseSelect).gte('scheduled_datetime', start).lte('scheduled_datetime', end);
  const withOptFilters = (q: ReturnType<typeof sessionQuery>) => {
    if (sp.location && sp.location !== 'all') q = q.eq('facility_id', sp.location);
    if (sp.coach && sp.coach !== 'all') q = q.eq('athlete_id', sp.coach);
    return q;
  };

  // Query only UPCOMING scheduled sessions
  const { data: upcomingData, error: upcomingError } = await withOptFilters(sessionQuery(dayStart, dayEnd))
    .eq('status', 'scheduled')
    .order('scheduled_datetime', { ascending: true });
  
  
  
  const seen = new Set<string>();
  let list: SessionRow[] = [];
  for (const row of (upcomingData ?? [])) {
    const r = row as unknown as SessionRow;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    list.push(r);
  }
  list.sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime));
  const timeWindow = sp.time;
  if (timeWindow && timeWindow !== 'any') {
    const [startHour, endHour] =
      timeWindow === 'morning' ? [6, 12] : timeWindow === 'afternoon' ? [12, 17] : timeWindow === 'evening' ? [17, 21] : [0, 24];
    list = list.filter((s) => {
      const t = toZonedTime(new Date(s.scheduled_datetime), APP_TIMEZONE);
      const h = t.getHours();
      return h >= startHour && h < endHour;
    });
  }
  // Show ALL sessions - we'll display badges to indicate public vs invite-only
  availabilitySessions = list;

  availabilitySessions = patchSessionsWithCoachReviewStats(availabilitySessions, reviewStatsMap);

  /** Coaches with at least one future public session that still has spots (grid "Available" + request CTA contrast). */
  const { data: publicSessionsForOpenCheck } = athleteIds.length
    ? await supabase
        .from('sessions')
        .select(
          `
          athlete_id,
          status,
          join_policy,
          scheduled_datetime,
          current_participants,
          max_participants,
          session_participants(id)
        `
        )
        .in('athlete_id', athleteIds)
        .eq('join_policy', 'public')
        .eq('status', 'scheduled')
        .gte('scheduled_datetime', nowIso)
    : { data: [] };
  const coachHasBookablePublicSession = new Set<string>();
  for (const row of publicSessionsForOpenCheck ?? []) {
    if (isSessionOpenForParentBrowse(row as Parameters<typeof isSessionOpenForParentBrowse>[0])) {
      coachHasBookablePublicSession.add((row as { athlete_id: string }).athlete_id);
    }
  }
  const coachIdsWithPublicOpen = [...coachHasBookablePublicSession].sort();

  const { data: weeklyAvailIds } = athleteIds.length
    ? await supabase.from('athlete_availability').select('athlete_id').in('athlete_id', athleteIds)
    : { data: [] };
  const weeklyAvailSet = new Set(
    (weeklyAvailIds ?? []).map((r: { athlete_id: string }) => r.athlete_id)
  );
  const { data: datedSlotIds } = athleteIds.length
    ? await supabase
        .from('athlete_availability_slots')
        .select('athlete_id')
        .in('athlete_id', athleteIds)
        .gte('slot_date', today)
    : { data: [] };
  const datedAvailSet = new Set(
    (datedSlotIds ?? []).map((r: { athlete_id: string }) => r.athlete_id)
  );
  const hasRealSchedulingAvailability = (coachId: string) =>
    weeklyAvailSet.has(coachId) || datedAvailSet.has(coachId);

  const { data: svcRows } = athleteIds.length
    ? await admin
        .from('athlete_services')
        .select('athlete_id, session_type')
        .in('athlete_id', athleteIds)
        .eq('active', true)
    : { data: [] };

  const { data: apRows } = athleteIds.length
    ? await admin
        .from('athlete_products')
        .select('athlete_id, product_id, enabled')
        .in('athlete_id', athleteIds)
        .eq('enabled', true)
    : { data: [] };
  const productIds = [...new Set((apRows ?? []).map((r: { product_id: string }) => r.product_id))];
  const { data: prodSlugRows } = productIds.length
    ? await admin.from('products').select('id, slug').in('id', productIds).eq('active', true)
    : { data: [] };
  const slugByProductId = new Map((prodSlugRows ?? []).map((p: { id: string; slug: string }) => [p.id, p.slug]));
  const productSlugRows = (apRows ?? [])
    .map((r: { athlete_id: string; product_id: string }) => ({
      athlete_id: r.athlete_id,
      slug: String(slugByProductId.get(r.product_id) ?? ''),
    }))
    .filter((r) => r.slug.length > 0);

  const serviceTypesByCoach = buildServiceTypesByCoach({
    athleteIds,
    serviceRows: (svcRows ?? []) as { athlete_id: string; session_type: string }[],
    productRows: productSlugRows,
  });

  let requestSessionCoaches = athletesMerged
    .filter(
      (a) => hasRealSchedulingAvailability(a.id) && !coachHasBookablePublicSession.has(a.id)
    )
    .map((a) => ({
      id: a.id,
      first_name: a.first_name,
      last_name: a.last_name,
      school: a.school,
      photo_url: a.photo_url,
    }));
  if (sp.coach && sp.coach !== 'all') {
    requestSessionCoaches = requestSessionCoaches.filter((c) => c.id === sp.coach);
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-foreground">Training</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
          Book from a coach&apos;s published availability, or join a public session when a slot fits your schedule.
        </p>
      </div>
      <div className="px-4">
      <TrainingClient
        key={`training-${tab}-${sp.coach ?? 'all'}-${sp.type ?? 'all'}-${sp.location ?? 'all'}-${sp.date ?? ''}-${sp.time ?? 'any'}`}
        initialTab={tab}
        athletesWithNext={athletesWithNext}
        facilities={facilities ?? []}
        availabilitySessions={availabilitySessions}
        availabilityDate={sp.date ?? ''}
        availabilityTime={sp.time ?? 'any'}
        availabilityLocation={sp.location ?? 'all'}
        availabilityCoach={sp.coach ?? 'all'}
        coaches={athletesMerged.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name, school: a.school }))}
        preselectedWrestlerId={sp.wrestler ?? ''}
        parentWrestlerIds={parentWrestlerIds}
        availabilitySessionType={sp.type ?? 'all'}
        coachIdsWithPublicOpen={coachIdsWithPublicOpen}
        serviceTypesByCoach={serviceTypesByCoach}
        requestSessionCoaches={requestSessionCoaches}
        coachFilterLocations={coachFilterLocations}
        coachIdsByFacilityId={coachIdsByFacilityId}
        coachDateFilterData={coachDateFilterData}
        coachDateFilterBounds={coachDateFilterBounds}
        initialFollowedCoachIds={initialFollowedCoachIds}
      />
      </div>
    </div>
  );
}
