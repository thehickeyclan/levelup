import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { toZonedTime } from 'date-fns-tz';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BrowseAthletesClient } from './browse-client';
import { Athlete } from '@/types';
import {
  fetchCoachReviewStatsMap,
  mergeCoachReviewStatsIntoAthlete,
  sortAthletesForBrowse,
} from '@/lib/coach-review-stats';
import { APP_TIMEZONE, formatEST } from '@/lib/format-date';
import { isSessionInProgressOrUpcoming, sessionListQueryLowerBoundIso } from '@/lib/sessions';

export const metadata = {
  title: 'Browse Elite Coaches | The Guild',
  description:
    'Train with NCAA wrestlers and elite coaches in your community. View profiles, bios, and reviews. Book private technique sessions.',
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ youthWrestlerId?: string }>;
}) {
  const sp = await searchParams;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  
  if (!tenant) {
    redirect('/404');
  }

  const tenantSlug = tenant.slug;
  const supabase = await createClient(tenantSlug);
  const admin = createAdminClient(tenantSlug);

  const { data: { user } } = await supabase.auth.getUser();

  let userData: { role: string } | null = null;
  if (user) {
    const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
    userData = data;
    if (userData?.role === 'coach') {
      redirect('/athlete-dashboard');
    }
  }
  let initialFollowedCoachIds: string[] = [];
  if (user && (userData?.role === 'parent' || userData?.role === 'admin')) {
    const { data: followRows } = await supabase
      .from('coach_follows')
      .select('coach_id')
      .eq('parent_id', user.id);
    initialFollowedCoachIds = [
      ...new Set((followRows ?? []).map((r: { coach_id: string }) => r.coach_id).filter(Boolean)),
    ];
  }

  // Fetch active athletes (profile complete). Photo and certifications optional for now.
  const { data: athletes, error } = await supabase
    .from('athletes')
    .select('*')
    .eq('active', true)
    .order('average_rating', { ascending: false, nullsFirst: true })
    .order('school', { ascending: true });

  if (error) {
    console.error('Error fetching athletes:', error);
  }

  const athletesList = (athletes || []) as Athlete[];
  const athleteIds = athletesList.map((a) => a.id);

  const reviewStatsMap = await fetchCoachReviewStatsMap(supabase, athleteIds);
  const athletesMerged = sortAthletesForBrowse(
    athletesList.map((a) => mergeCoachReviewStatsIntoAthlete(a, reviewStatsMap))
  );

  const todayEastern = formatEST(new Date(), 'yyyy-MM-dd');
  const sessionListLowerIso = sessionListQueryLowerBoundIso();

  const { data: upcomingSessions } = athleteIds.length
    ? await admin
        .from('sessions')
        .select('athlete_id, scheduled_datetime, duration_minutes, status')
        .in('athlete_id', athleteIds)
        .eq('status', 'scheduled')
        .gte('scheduled_datetime', sessionListLowerIso)
        .order('scheduled_datetime', { ascending: true })
    : { data: [] };

  const nextByAthlete = new Map<string, { slot_date: string; start_time: string }>();
  for (const row of upcomingSessions ?? []) {
    const r = row as { athlete_id: string; scheduled_datetime: string; duration_minutes?: number | null; status?: string | null };
    if (!isSessionInProgressOrUpcoming(r)) continue;
    if (nextByAthlete.has(r.athlete_id)) continue;
    const zoned = toZonedTime(new Date(r.scheduled_datetime), APP_TIMEZONE);
    const y = zoned.getFullYear();
    const m = zoned.getMonth() + 1;
    const day = zoned.getDate();
    const slotDate = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const startTime = `${String(zoned.getHours()).padStart(2, '0')}:${String(zoned.getMinutes()).padStart(2, '0')}`;
    nextByAthlete.set(r.athlete_id, { slot_date: slotDate, start_time: startTime });
  }

  const { data: slots } = athleteIds.length
    ? await supabase
        .from('athlete_availability_slots')
        .select('athlete_id, slot_date, start_time')
        .in('athlete_id', athleteIds)
        .gte('slot_date', todayEastern)
        .order('slot_date', { ascending: true })
        .order('start_time', { ascending: true })
    : { data: [] };
  for (const row of slots || []) {
    const r = row as { athlete_id: string; slot_date: string; start_time: string };
    if (!nextByAthlete.has(r.athlete_id)) {
      nextByAthlete.set(r.athlete_id, { slot_date: r.slot_date, start_time: r.start_time });
    }
  }

  const athletesWithNext = athletesMerged.map((a) => ({
    ...a,
    nextAvailable: nextByAthlete.get(a.id) ?? null,
  }));

  const isAdmin = userData?.role === 'admin';
  return (
    <BrowseAthletesClient
      initialAthletes={athletesWithNext}
      isAdmin={!!isAdmin}
      initialYouthWrestlerId={sp.youthWrestlerId ?? undefined}
      initialFollowedCoachIds={initialFollowedCoachIds}
    />
  );
}
