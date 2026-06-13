import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { purgeEmptyPastSessions } from '@/lib/purge-empty-past-sessions';
import { CoachSessionsClient, type CommunitySession } from './coach-sessions-client';
import { normalizeCoachRevenueShareRate } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default async function CoachSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tabParam = sp.tab;
  if (tabParam !== 'all') {
    if (tabParam === 'requests') redirect('/athlete-dashboard?tab=requests');
    if (tabParam === 'past' || tabParam === 'completed') redirect('/athlete-dashboard?tab=past');
    redirect('/athlete-dashboard');
  }

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const admin = createAdminClient(tenant.slug);
  await purgeEmptyPastSessions(admin);

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'coach' && userData?.role !== 'admin') redirect('/athlete-dashboard');

  const cookieStore = await cookies();
  const viewAsCoachId =
    userData?.role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;

  const coachId = viewAsCoachId || user.id;

  const { data: athlete } =
    userData?.role === 'admin'
      ? await admin.from('athletes').select('*').eq('id', coachId).maybeSingle()
      : await supabase.from('athletes').select('*').eq('id', coachId).maybeSingle();

  if (!viewAsCoachId && !athlete) {
    redirect('/onboarding');
  }

  const now = new Date().toISOString();

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
      <h1 className="text-2xl font-bold text-foreground md:text-3xl mb-1">Open sessions</h1>
      <p className="text-muted-foreground text-sm md:text-base mb-6">
        Other coaches&apos; public sessions parents can discover
      </p>
      <CoachSessionsClient
        initialTab="all"
        communityOnly
        upcomingSessions={[]}
        completedSessions={[]}
        pendingRequests={[]}
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
