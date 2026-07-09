import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { isProfileComplete } from '@/lib/athletes';
import { normalizeCoachRevenueShareRate } from '@/lib/pricing';
import {
  fetchPastSessionsForCoachEarnings,
  summarizeCoachEarningsFromPastSessions,
} from '@/lib/coach-earnings-summary-server';
import { CoachEarningsClient } from '@/components/coach/coach-earnings-client';

export const dynamic = 'force-dynamic';

export default async function CoachEarningsPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'coach' && userData?.role !== 'admin') {
    if (userData?.role === 'parent') redirect('/browse');
    redirect('/login');
  }

  const cookieStore = await cookies();
  const viewAsCoachId =
    userData?.role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;
  const coachId = viewAsCoachId || user.id;
  const isViewingAsCoach = !!viewAsCoachId;

  const admin = createAdminClient(tenant.slug);

  const { data: athlete } =
    userData?.role === 'admin'
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
        <div className="container mx-auto px-4 py-5 pb-24 md:py-8 max-w-2xl">
          <CoachEarningsClient
            coachId={coachId}
            payoutRate={0.8}
            thisMonthEarnings={0}
            allTimeEarnings={0}
            projectedEarnings={0}
            upcomingSessionCount={0}
            thisMonthSessionCount={0}
            totalPastSessionCount={0}
            averageRating={null}
            reviewCount={0}
            recentReviews={[]}
            earningsSessions={[]}
            needsOnboarding={false}
            adminPickCoachHint
            showLeaderboard={false}
          />
        </div>
      );
    }
    redirect('/onboarding');
  }

  const coachStatus = athlete.status || 'active';
  if (!isViewingAsCoach && coachStatus === 'pending') redirect('/coach-pending');
  if (!isViewingAsCoach && coachStatus === 'rejected') redirect('/coach-pending');

  const needsOnboarding = !isViewingAsCoach && !isProfileComplete(athlete);
  const payoutRate = normalizeCoachRevenueShareRate(
    athlete?.payout_rate != null ? Number(athlete.payout_rate) : null
  );
  const nowIso = new Date().toISOString();

  const pastSessionsRaw = await fetchPastSessionsForCoachEarnings(admin, coachId, nowIso);
  const {
    earningsSessions,
    thisMonthSessions,
    getSessionPayout,
    thisMonthEarnings,
    allTimeEarnings,
  } = summarizeCoachEarningsFromPastSessions(pastSessionsRaw, payoutRate, nowIso);

  const { data: upcomingSessions } = await admin
    .from('sessions')
    .select('id, total_price, session_payout_rate')
    .eq('athlete_id', coachId)
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', nowIso);

  const projectedEarnings = (upcomingSessions ?? []).reduce((sum, s) => {
    const rate = normalizeCoachRevenueShareRate(
      s.session_payout_rate != null ? Number(s.session_payout_rate) : payoutRate
    );
    return sum + Number(s.total_price || 0) * rate;
  }, 0);

  const reviewsDb = admin ?? supabase;
  const { count: reviewCount } = await reviewsDb
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('athlete_id', coachId);

  const { data: recentReviewsRaw } = await reviewsDb
    .from('reviews')
    .select('id, rating, comment, created_at, users(first_name)')
    .eq('athlete_id', coachId)
    .order('created_at', { ascending: false })
    .limit(3);

  const recentReviews = (recentReviewsRaw ?? []).map((r) => ({
    id: r.id as string,
    rating: r.rating as number,
    comment: r.comment as string | null,
    created_at: r.created_at as string,
    users: Array.isArray(r.users) ? r.users[0] ?? null : r.users,
  }));

  const earningsSessionsWithPayout = earningsSessions.map((session) => ({
    id: session.id,
    scheduled_datetime: session.scheduled_datetime,
    session_type: session.session_type,
    current_participants: session.current_participants,
    payout: getSessionPayout(session),
  }));

  return (
    <div className="container mx-auto px-4 py-5 pb-24 md:py-8 max-w-2xl">
      <CoachEarningsClient
        coachId={coachId}
        payoutRate={payoutRate}
        thisMonthEarnings={thisMonthEarnings}
        allTimeEarnings={allTimeEarnings}
        projectedEarnings={projectedEarnings}
        upcomingSessionCount={upcomingSessions?.length ?? 0}
        thisMonthSessionCount={thisMonthSessions.length}
        totalPastSessionCount={earningsSessions.length}
        averageRating={athlete?.average_rating ?? null}
        reviewCount={reviewCount ?? 0}
        recentReviews={recentReviews}
        earningsSessions={earningsSessionsWithPayout}
        needsOnboarding={needsOnboarding}
        showLeaderboard={!(userData?.role === 'admin' && !viewAsCoachId)}
      />
    </div>
  );
}
