import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { toZonedTime } from 'date-fns-tz';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { APP_TIMEZONE } from '@/lib/format-date';
import { FindTrainingClient } from './find-training-client';
import { fetchCoachReviewStatsMap, patchSessionsWithCoachReviewStats } from '@/lib/coach-review-stats';

export const metadata = {
  title: 'Find training',
  description:
    'Browse public sessions you can join, or find a coach to book and schedule your own time.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FindTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; time?: string; location?: string; coach?: string }>;
}) {
  const sp = await searchParams;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const admin = createAdminClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();

  let userData: { role: string } | null = null;
  if (user) {
    const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
    userData = data;
    if (userData?.role === 'coach') redirect('/athlete-dashboard');
    if (
      userData?.role !== 'parent' &&
      userData?.role !== 'admin' &&
      userData?.role !== 'youth_wrestler'
    ) {
      redirect('/dashboard');
    }
  }

  const { data: facilities } = await supabase
    .from('facilities')
    .select('id, name, school, address')
    .order('name');

  let sessions: Array<{
    id: string;
    scheduled_datetime: string;
    session_type: string | null;
    session_mode: string | null;
    focus_area: string | null;
    current_participants: number | null;
    max_participants: number | null;
    total_price: number | null;
    price_per_participant: number | null;
    athlete_id: string;
    facility_id: string;
    athletes?: { id: string; first_name?: string; last_name?: string; school?: string } | null;
    facilities?: { id: string; name?: string; address?: string } | null;
    session_participants?: Array<{ id?: string; youth_wrestler_id?: string; roster_first_name?: string; roster_last_name?: string; roster_photo_url?: string; youth_wrestlers?: { id: string; first_name?: string; last_name?: string; photo_url?: string } | null } | null>;
  }> = [];

  const dateParam = sp.date;
  if (dateParam) {
    const d = new Date(dateParam);
    if (!Number.isNaN(d.getTime())) {
      const dateOnly = dateParam.split('T')[0];
      const dayStart = `${dateOnly}T00:00:00.000Z`;
      const dayEnd = `${dateOnly}T23:59:59.999Z`;

      const baseQuery = () => {
        let q = admin
          .from('sessions')
          .select(`
            id,
            scheduled_datetime,
            session_type,
            session_mode,
            join_policy,
            focus_area,
            current_participants,
            max_participants,
            total_price,
            price_per_participant,
            athlete_id,
            facility_id,
            athletes(id, first_name, last_name, school, photo_url, average_rating, review_count),
            facilities(id, name, address),
            session_participants(id, youth_wrestler_id, youth_wrestlers(id, first_name, last_name, photo_url))
          `)
          .eq('status', 'scheduled')
          .gte('scheduled_datetime', dayStart)
          .lte('scheduled_datetime', dayEnd);
        if (sp.location && sp.location !== 'all') {
          q = q.eq('facility_id', sp.location);
        }
        if (sp.coach && sp.coach !== 'all') {
          q = q.eq('athlete_id', sp.coach);
        }
        return q;
      };

      const [groupRes, partnerRes] = await Promise.all([
        baseQuery().in('session_type', ['group', 'small_group', '2-athlete']).order('scheduled_datetime', { ascending: true }),
        baseQuery().eq('session_mode', 'partner-open').order('scheduled_datetime', { ascending: true }),
      ]);

      const seen = new Set<string>();
      let list: typeof sessions = [];
      for (const row of [...(groupRes.data ?? []), ...(partnerRes.data ?? [])]) {
        const r = row as unknown as (typeof sessions)[0];
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

      sessions = list.filter((s) => (s as { join_policy?: string }).join_policy === 'public');
    }
  }
  /* When only location is set (no date), show sessions at that facility in the next 14 days */
  if (!dateParam && sp.location && sp.location !== 'all') {
    const nowLoc = new Date();
    const dayStart = nowLoc.toISOString();
    const twoWeeks = new Date(nowLoc);
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    const dayEnd = twoWeeks.toISOString();
    const baseQ = () => {
      let q = admin.from('sessions').select('id, scheduled_datetime, session_type, session_mode, join_policy, focus_area, current_participants, max_participants, total_price, price_per_participant, athlete_id, facility_id, athletes(id, first_name, last_name, school, photo_url, average_rating, review_count), facilities(id, name, address), session_participants(id, youth_wrestler_id, youth_wrestlers(id, first_name, last_name, photo_url))').eq('status', 'scheduled').eq('facility_id', sp.location).gte('scheduled_datetime', dayStart).lte('scheduled_datetime', dayEnd);
      if (sp.coach && sp.coach !== 'all') q = q.eq('athlete_id', sp.coach);
      return q;
    };
    const [groupRes2, partnerRes2] = await Promise.all([
      baseQ().in('session_type', ['group', 'small_group', '2-athlete']).order('scheduled_datetime', { ascending: true }),
      baseQ().eq('session_mode', 'partner-open').order('scheduled_datetime', { ascending: true }),
    ]);
    const seen2 = new Set<string>();
    let list2: typeof sessions = [];
    for (const row of [...(groupRes2.data ?? []), ...(partnerRes2.data ?? [])]) {
      const r = row as unknown as (typeof sessions)[0];
      if (seen2.has(r.id)) continue;
      seen2.add(r.id);
      list2.push(r);
    }
    list2.sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime));
    sessions = list2.filter((s) => (s as { join_policy?: string }).join_policy === 'public');
  }

  const { data: athletes } = await supabase
    .from('athletes')
    .select('id, first_name, last_name, school')
    .eq('active', true)
    .order('school', { ascending: true });

  // Participant names are fetched client-side via /api/sessions/participant-names
  const sessionCoachIds = [...new Set(sessions.map((s) => s.athlete_id).filter(Boolean))];
  const findTrainingReviewStatsMap = await fetchCoachReviewStatsMap(supabase, sessionCoachIds);
  const sessionsWithReviewStats = patchSessionsWithCoachReviewStats(sessions, findTrainingReviewStatsMap);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Find training</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Most families book or request a session with a coach first. Use the filters below to browse{' '}
          <span className="text-foreground/90">public sessions you can join</span> when a coach has posted one—those
          are optional, not the only way to train.
        </p>
      </div>
      <FindTrainingClient
        facilities={facilities ?? []}
        initialSessions={sessionsWithReviewStats}
        initialDate={dateParam ?? ''}
        initialTime={sp.time ?? 'any'}
        initialLocation={sp.location ?? 'all'}
        initialCoach={sp.coach ?? 'all'}
        coaches={athletes ?? []}
        searchBasePath="/find-training"
      />
    </div>
  );
}
