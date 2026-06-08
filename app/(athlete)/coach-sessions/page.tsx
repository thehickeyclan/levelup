import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { purgeEmptyPastSessions } from '@/lib/purge-empty-past-sessions';
import { CoachSessionsClient, type CommunitySession } from './coach-sessions-client';
import type { CoachSession } from '@/app/(athlete)/athlete-dashboard/coach-schedule-card';
import { normalizeCoachRevenueShareRate } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default async function CoachSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tabParam = sp.tab;
  const initialTab: 'mine' | 'requests' | 'completed' | 'all' =
    tabParam === 'requests'
      ? 'requests'
      : tabParam === 'past' || tabParam === 'completed'
        ? 'completed'
        : tabParam === 'all'
          ? 'all'
          : 'mine';

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const admin = createAdminClient(tenant.slug);
  await purgeEmptyPastSessions(admin);

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'coach' && userData?.role !== 'admin') redirect('/athlete-dashboard');

  // For admins viewing as a specific coach, use the viewAsCoachId
  const cookieStore = await cookies();
  const viewAsCoachId = userData?.role === 'admin' 
    ? cookieStore.get('levelup_view_as_coach_id')?.value 
    : null;
  
  // The coach ID to use for queries - either the viewed coach or the logged-in user
  const coachId = viewAsCoachId || user.id;

  const { data: athlete } =
    userData?.role === 'admin'
      ? await admin.from('athletes').select('*').eq('id', coachId).maybeSingle()
      : await supabase.from('athletes').select('*').eq('id', coachId).maybeSingle();
  
  // Missing athlete row — must complete signup; incomplete profile is OK (banner on home)
  if (!viewAsCoachId && !athlete) {
    redirect('/onboarding');
  }

  const now = new Date().toISOString();

  const { data: upcoming } = await admin
    .from('sessions')
    .select(
      '*, facilities(name), session_participants(youth_wrestler_id, roster_first_name, roster_last_name, amount_paid, youth_wrestlers(id, first_name, last_name))'
    )
    .eq('athlete_id', coachId)
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', now)
    .order('scheduled_datetime', { ascending: true });

  const { data: completed } = await admin
    .from('sessions')
    .select(
      '*, facilities(name), session_participants(youth_wrestler_id, roster_first_name, roster_last_name, amount_paid, youth_wrestlers(id, first_name, last_name))'
    )
    .eq('athlete_id', coachId)
    .or('status.eq.completed,status.eq.cancelled,status.eq.no-show,scheduled_datetime.lt.' + now)
    .order('scheduled_datetime', { ascending: false })
    .limit(30);

  // Pending join requests for coach's sessions (RLS returns only coach's sessions)
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

  // Other coaches’ bookable sessions (same visibility as parent Training list — public / invite_only)
  const { data: communitySessions } = await supabase
    .from('sessions')
    .select(`
      id,
      scheduled_datetime,
      status,
      session_type,
      session_mode,
      join_policy,
      focus_area,
      current_participants,
      max_participants,
      price_per_participant,
      athlete_id,
      athletes:athlete_id(id, first_name, last_name, school, photo_url),
      facilities:facility_id(id, name)
    `)
    .neq('athlete_id', coachId)
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', now)
    .in('join_policy', ['public', 'invite_only'])
    .order('scheduled_datetime', { ascending: true })
    .limit(150);

  return (
    <div className="container mx-auto px-4 py-5 pb-8 md:py-8 max-w-full">
      <h1 className="text-2xl font-bold text-foreground md:text-3xl mb-1">My sessions</h1>
      <p className="text-muted-foreground text-sm md:text-base mb-6">
        Your upcoming sessions · Requests · Past · All open sessions on the platform
      </p>
      <CoachSessionsClient
        initialTab={initialTab}
        upcomingSessions={(upcoming ?? []) as CoachSession[]}
        completedSessions={(completed ?? []) as CoachSession[]}
        pendingRequests={requestsWithSession as Array<{
          id: string;
          session_id: string;
          message?: string;
          status: string;
          created_at: string;
          youth_wrestler_id: string;
          youth_wrestlers?: { id: string; first_name?: string; last_name?: string; age?: number; weight_class?: string; skill_level?: string } | null;
          session?: { id: string; scheduled_datetime: string; session_type?: string; session_mode?: string; facilities?: { name?: string } | null };
        }>}
        payoutRate={normalizeCoachRevenueShareRate(
          athlete?.payout_rate != null ? Number(athlete.payout_rate) : null
        )}
        communitySessions={(communitySessions ?? []) as unknown as CommunitySession[]}
        coachDisplayName={
          [athlete?.first_name, athlete?.last_name].filter(Boolean).join(' ').trim() || 'Coach'
        }
      />
    </div>
  );
}
