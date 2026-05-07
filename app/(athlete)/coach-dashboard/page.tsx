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
import { CoachDashboardClient } from './coach-dashboard-client';

export const dynamic = 'force-dynamic';

export default async function CoachDashboardPage() {
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
  const viewAsCoachId = userData?.role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;
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
        <div className="container mx-auto px-4 py-8 max-w-lg">
          <h1 className="text-xl font-semibold mb-2">Coach dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Choose a coach in the header (preview as coach) to see earnings, reviews, and playbook for that coach.
          </p>
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
    thisMonthEarnings,
    allTimeEarnings,
  } = summarizeCoachEarningsFromPastSessions(pastSessionsRaw, payoutRate, nowIso);

  const { count: reviewCount } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('athlete_id', coachId);

  const { data: recentReviewsRaw } = await supabase
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

  return (
    <div className="container mx-auto px-4 py-5 pb-24 md:py-8 max-w-full">
      <CoachDashboardClient
        coachId={coachId}
        thisMonthEarnings={thisMonthEarnings}
        allTimeEarnings={allTimeEarnings}
        thisMonthSessionCount={thisMonthSessions.length}
        totalPastSessionCount={earningsSessions.length}
        payoutRate={payoutRate}
        averageRating={athlete?.average_rating ?? null}
        reviewCount={reviewCount ?? 0}
        recentReviews={recentReviews}
        needsOnboarding={needsOnboarding}
      />
    </div>
  );
}
