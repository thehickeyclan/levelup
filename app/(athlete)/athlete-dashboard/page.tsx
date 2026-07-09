import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeCoachRevenueShareRate } from '@/lib/pricing';
import {
  fetchPastSessionsForCoachEarnings,
  summarizeCoachEarningsFromPastSessions,
} from '@/lib/coach-earnings-summary-server';
import { fetchCoachActivationPanelData } from '@/lib/coach-activation-server';
import { coachPublicScheduleUrl } from '@/lib/coach-public-schedule-url';
import { CoachScheduleClient, type JoinRequestItem, type ScheduleTab } from './coach-schedule-client';
import type { CoachSession } from './coach-schedule-card';

export const dynamic = 'force-dynamic';

export default async function CoachHomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const initialTab: ScheduleTab =
    sp.tab === 'past' ? 'past' : sp.tab === 'requests' ? 'requests' : 'upcoming';

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'coach' && userData?.role !== 'admin') {
    if (userData?.role === 'parent') redirect('/browse');
    redirect('/login');
  }

  const cookieStore = await cookies();
  const viewAsCoachId = userData?.role === 'admin' 
    ? cookieStore.get('levelup_view_as_coach_id')?.value 
    : null;
  
  const coachId = viewAsCoachId || user.id;
  const isViewingAsCoach = !!viewAsCoachId;

  const admin = userData?.role === 'admin' ? createAdminClient(tenant.slug) : null;

  const { data: athlete } = admin
    ? await admin.from('athletes').select('*').eq('id', coachId).maybeSingle()
    : await supabase.from('athletes').select('*').eq('id', coachId).maybeSingle();

  if (!athlete) {
    if (isViewingAsCoach) {
      return (
        <div className="container mx-auto px-4 py-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Coach not found</h1>
          <p className="text-muted-foreground">Select a different coach from the dropdown above.</p>
        </div>
      );
    }
    if (userData?.role === 'admin' && !viewAsCoachId) {
      return (
        <div className="container mx-auto px-4 py-8 max-w-lg">
          <h1 className="text-xl font-semibold mb-2">Schedule</h1>
          <p className="text-muted-foreground text-sm">
            Choose a coach in the header (preview as coach) to see that coach&apos;s schedule.
          </p>
        </div>
      );
    }
    redirect('/onboarding');
  }
  
  const coachStatus = athlete.status || 'active';
  if (!isViewingAsCoach && coachStatus === 'pending') {
    redirect('/coach-pending');
  }
  
  if (!isViewingAsCoach && coachStatus === 'rejected') {
    redirect('/coach-pending');
  }

  const nowIso = new Date().toISOString();

  const { data: upcomingSessions } = await supabase
    .from('sessions')
    .select(
      '*, facilities(id, name), session_participants(youth_wrestler_id, roster_first_name, roster_last_name, amount_paid, youth_wrestlers(id, first_name, last_name))'
    )
    .eq('athlete_id', coachId)
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', nowIso)
    .order('scheduled_datetime', { ascending: true })
    .limit(100);

  const pastDb = admin ?? supabase;
  const { data: pastSessions } = await pastDb
    .from('sessions')
    .select(
      '*, facilities(id, name), session_participants(youth_wrestler_id, roster_first_name, roster_last_name, amount_paid, youth_wrestlers(id, first_name, last_name))'
    )
    .eq('athlete_id', coachId)
    .or(`status.eq.completed,status.eq.cancelled,status.eq.no-show,scheduled_datetime.lt.${nowIso}`)
    .order('scheduled_datetime', { ascending: false })
    .limit(30);

  const { data: joinRequests } = await supabase
    .from('session_join_requests')
    .select(`
      id,
      session_id,
      message,
      status,
      created_at,
      youth_wrestler_id,
      youth_wrestlers(id, first_name, last_name, age, weight_class, skill_level)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const sessionIds = [...new Set((joinRequests ?? []).map((r: { session_id: string }) => r.session_id))];
  const { data: requestSessions } = sessionIds.length > 0
    ? await supabase
        .from('sessions')
        .select('id, scheduled_datetime, session_type, session_mode, facilities(name)')
        .in('id', sessionIds)
    : { data: [] };

  const sessionMap = new Map((requestSessions ?? []).map((s: { id: string }) => [s.id, s]));
  const requestsWithSession = (joinRequests ?? []).map((r: { session_id: string; [k: string]: unknown }) => ({
    ...r,
    session: sessionMap.get(r.session_id),
  }));

  const coachFirstName = athlete?.first_name ?? null;
  const coachDisplayName =
    [athlete?.first_name, athlete?.last_name].filter(Boolean).join(' ').trim() || 'Coach';

  const availabilityDb = admin ?? supabase;
  const [{ data: latestWeekly }, { data: latestSlot }] = await Promise.all([
    availabilityDb
      .from('athlete_availability')
      .select('updated_at, created_at')
      .eq('athlete_id', coachId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    availabilityDb
      .from('athlete_availability_slots')
      .select('created_at')
      .eq('athlete_id', coachId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const calendarCandidates = [
    (latestWeekly as { updated_at?: string; created_at?: string } | null)?.updated_at,
    (latestWeekly as { updated_at?: string; created_at?: string } | null)?.created_at,
    (latestSlot as { created_at?: string } | null)?.created_at,
  ].filter((t): t is string => Boolean(t));
  const calendarLastUpdatedAt =
    calendarCandidates.length > 0
      ? calendarCandidates.reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
      : null;

  const payoutRate = normalizeCoachRevenueShareRate(
    athlete?.payout_rate != null ? Number(athlete.payout_rate) : null
  );
  const pastSessionsRaw = await fetchPastSessionsForCoachEarnings(admin ?? supabase, coachId, nowIso);
  const { thisMonthSessions, thisMonthEarnings } = summarizeCoachEarningsFromPastSessions(
    pastSessionsRaw,
    payoutRate,
    nowIso
  );
  const projectedEarnings = (upcomingSessions ?? []).reduce((sum, s) => {
    const rate = normalizeCoachRevenueShareRate(
      s.session_payout_rate != null ? Number(s.session_payout_rate) : payoutRate
    );
    return sum + Number(s.total_price || 0) * rate;
  }, 0);

  const activationDb = admin ?? supabase;
  const activationPanel = await fetchCoachActivationPanelData(
    activationDb,
    coachId,
    athlete,
    nowIso
  );

  const scheduleUrl = coachPublicScheduleUrl(
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      (host.startsWith('localhost') ? `http://${host}` : `https://${host}`),
    coachId
  );

  return (
    <div className="container mx-auto px-4 py-4 pb-24 md:py-8 max-w-lg md:max-w-full">
      <CoachScheduleClient
        coachId={coachId}
        scheduleUrl={scheduleUrl}
        upcomingSessions={(upcomingSessions ?? []) as CoachSession[]}
        pastSessions={(pastSessions ?? []) as CoachSession[]}
        pendingJoinRequests={requestsWithSession as JoinRequestItem[]}
        coachFirstName={coachFirstName}
        coachDisplayName={coachDisplayName}
        coachSchool={athlete?.school ?? null}
        calendarLastUpdatedAt={calendarLastUpdatedAt}
        initialTab={initialTab}
        thisMonthEarnings={thisMonthEarnings}
        thisMonthSessionCount={thisMonthSessions.length}
        projectedEarnings={projectedEarnings}
        upcomingSessionCount={upcomingSessions?.length ?? 0}
        activationPanel={activationPanel.showPanel ? activationPanel : null}
      />
    </div>
  );
}
