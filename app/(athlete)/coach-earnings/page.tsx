import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, Clock } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { coachRevenueSharePercentDisplay, normalizeCoachRevenueShareRate } from '@/lib/pricing';
import { CoachRankCard } from '@/components/coach-rank-card';
import { formatUsdTwoDecimals } from '@/lib/coach-session-payout';
import {
  fetchPastSessionsForCoachEarnings,
  summarizeCoachEarningsFromPastSessions,
} from '@/lib/coach-earnings-summary-server';

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
    redirect('/login');
  }

  const cookieStore = await cookies();
  const viewAsCoachId =
    userData?.role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;
  const coachId = viewAsCoachId || user.id;

  // Service role so admins "viewing as coach" still read that coach's sessions (RLS is auth.uid()-scoped).
  const admin = createAdminClient(tenant.slug);

  const { data: athlete } =
    userData?.role === 'admin'
      ? await admin.from('athletes').select('first_name, payout_rate').eq('id', coachId).maybeSingle()
      : await supabase.from('athletes').select('first_name, payout_rate').eq('id', coachId).maybeSingle();

  const payoutRate = normalizeCoachRevenueShareRate(
    athlete?.payout_rate != null ? Number(athlete.payout_rate) : null
  );
  const payoutPercentDisplay = coachRevenueSharePercentDisplay(
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

  const totalSessions = earningsSessions.length;

  const { data: upcomingSessions } = await admin
    .from('sessions')
    .select('id, scheduled_datetime, total_price, session_type, current_participants, max_participants, session_payout_rate')
    .eq('athlete_id', coachId)
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', nowIso)
    .order('scheduled_datetime', { ascending: true })
    .limit(10);

  const projectedEarnings = (upcomingSessions ?? []).reduce((sum, s) => {
    const rate = normalizeCoachRevenueShareRate(
      s.session_payout_rate != null ? Number(s.session_payout_rate) : payoutRate
    );
    const totalPrice = Number(s.total_price || 0);
    return sum + totalPrice * rate;
  }, 0);

  return (
    <div className="container mx-auto px-4 py-5 pb-24 md:py-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Earnings</h1>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Your rate</p>
          <p className="font-semibold text-foreground">
            {payoutPercentDisplay}%
            {payoutRate >= 0.9 && (
              <span className="ml-1 text-xs text-accent font-medium">(Founding Coach)</span>
            )}
          </p>
        </div>
      </div>

      {!(userData?.role === 'admin' && !viewAsCoachId) ? (
        <div className="mb-6">
          <CoachRankCard coachId={coachId} topSessionsListSize={5} />
        </div>
      ) : null}

      {userData?.role === 'admin' && !viewAsCoachId && (
        <p className="text-sm text-muted-foreground mb-4 rounded-md border border-border bg-muted/30 px-3 py-2">
          Choose a coach in the header to see that coach&apos;s earnings. You&apos;re signed in as admin.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm">This Month</span>
            </div>
            <p className="text-2xl font-bold text-foreground">${formatUsdTwoDecimals(thisMonthEarnings)}</p>
            <p className="text-xs text-muted-foreground">
              {thisMonthSessions.length} session{thisMonthSessions.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">All Time</span>
            </div>
            <p className="text-2xl font-bold text-foreground">${formatUsdTwoDecimals(allTimeEarnings)}</p>
            <p className="text-xs text-muted-foreground">
              {totalSessions} session{totalSessions !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {projectedEarnings > 0 && (
        <Card className="mb-6 border-accent/30 bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-accent mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">Projected from upcoming sessions</span>
            </div>
            <p className="text-2xl font-bold text-foreground">${formatUsdTwoDecimals(projectedEarnings)}</p>
            <p className="text-xs text-muted-foreground">
              {upcomingSessions?.length ?? 0} upcoming session{(upcomingSessions?.length ?? 0) !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Your payout rate:{' '}
            <span className="font-medium text-foreground">{payoutPercentDisplay}%</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            You earn {payoutPercentDisplay}% of each session&apos;s total price after payment processing.
          </p>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-3">Recent Sessions</h2>
        {earningsSessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                No past sessions with earnings yet. Completed sessions and past bookings you haven&apos;t closed out appear
                here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {earningsSessions.slice(0, 10).map((session) => (
              <Card key={session.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {formatEST(new Date(session.scheduled_datetime!), 'MMM d, yyyy')}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {session.session_type?.replace('_', ' ') ?? 'Session'} · {session.current_participants ?? 1} athlete
                      {(session.current_participants ?? 1) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-emerald-500">+${formatUsdTwoDecimals(getSessionPayout(session))}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
