import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { formatEST } from '@/lib/format-date';
import { normalizeCoachRevenueShareRate } from '@/lib/pricing';
import {
  type CoachEarningsSessionRow,
  isCoachSessionClosedOutForEarnings,
  isCoachSessionEarningsEligible,
  isCoachSessionInEarningsMonth,
  payoutUsdForCoachEarningsSession,
} from '@/lib/coach-earnings-summary-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient(tenant.slug);

  const { data: coaches, error: coachesError } = await admin
    .from('athletes')
    .select('id, first_name, last_name, average_rating, review_count, payout_rate')
    .eq('active', true);

  if (coachesError) {
    return NextResponse.json({ error: coachesError.message }, { status: 500 });
  }

  const coachIds = coaches?.map((c) => c.id) ?? [];
  if (coachIds.length === 0) {
    return NextResponse.json({ leaderboard: [], totalCoaches: 0 });
  }

  const coachDefaultRateMap: Record<string, number> = {};
  (coaches ?? []).forEach((c) => {
    coachDefaultRateMap[c.id] = normalizeCoachRevenueShareRate(
      c.payout_rate != null ? Number(c.payout_rate) : null
    );
  });

  const nowIso = new Date().toISOString();
  const thisMonthKey = formatEST(nowIso, 'yyyy-MM');

  /** Same broad fetch as coach earnings + eligibility filter (includes past scheduled, not only status=completed). */
  const { data: pastSessionsRaw, error: sessionsErr } = await admin
    .from('sessions')
    .select(
      `
      id,
      athlete_id,
      scheduled_datetime,
      status,
      completed_at,
      athlete_payment,
      price_per_participant,
      current_participants,
      session_payout_rate,
      session_participants(id, amount_paid)
    `
    )
    .in('athlete_id', coachIds)
    .or(`status.eq.completed,status.eq.cancelled,status.eq.no-show,scheduled_datetime.lt.${nowIso}`)
    .not('scheduled_datetime', 'is', null);

  if (sessionsErr) {
    return NextResponse.json({ error: sessionsErr.message }, { status: 500 });
  }

  const sessionCountMap: Record<string, number> = {};
  const thisMonthCountMap: Record<string, number> = {};
  const earningsMap: Record<string, number> = {};

  for (const raw of pastSessionsRaw ?? []) {
    const s = raw as CoachEarningsSessionRow;
    if (!isCoachSessionEarningsEligible(s, nowIso)) continue;

    const aid = (s.athlete_id ?? (raw as { athlete_id?: string }).athlete_id) as string;
    if (!aid) continue;

    sessionCountMap[aid] = (sessionCountMap[aid] || 0) + 1;

    if (isCoachSessionInEarningsMonth(s, thisMonthKey) && isCoachSessionClosedOutForEarnings(s)) {
      thisMonthCountMap[aid] = (thisMonthCountMap[aid] || 0) + 1;
    }

    if (!isCoachSessionClosedOutForEarnings(s)) continue;

    const defaultRate = coachDefaultRateMap[aid] ?? normalizeCoachRevenueShareRate(null);
    const payout = payoutUsdForCoachEarningsSession(s, defaultRate);
    earningsMap[aid] = (earningsMap[aid] || 0) + payout;
  }

  const leaderboard = (coaches ?? []).map((coach) => ({
    id: coach.id,
    name: `${coach.first_name} ${coach.last_name}`,
    sessionCount: sessionCountMap[coach.id] || 0,
    totalEarningsUsd: Math.round((earningsMap[coach.id] || 0) * 100) / 100,
    averageRating: coach.average_rating != null ? Number(coach.average_rating) : null,
    reviewCount: coach.review_count || 0,
    thisMonthSessions: thisMonthCountMap[coach.id] || 0,
  }));

  const bySessionCount = [...leaderboard].sort((a, b) => b.sessionCount - a.sessionCount);
  const sessionRankMap: Record<string, number> = {};
  bySessionCount.forEach((c, i) => {
    sessionRankMap[c.id] = i + 1;
  });

  const byEarnings = [...leaderboard].sort((a, b) => b.totalEarningsUsd - a.totalEarningsUsd);
  const earningsRankMap: Record<string, number> = {};
  byEarnings.forEach((c, i) => {
    earningsRankMap[c.id] = i + 1;
  });

  const byRating = [...leaderboard]
    .filter((c) => c.reviewCount > 0 && c.averageRating != null)
    .sort((a, b) => {
      const br = b.averageRating ?? 0;
      const ar = a.averageRating ?? 0;
      if (br !== ar) return br - ar;
      return b.reviewCount - a.reviewCount;
    });
  const ratingRankMap: Record<string, number> = {};
  byRating.forEach((c, i) => {
    ratingRankMap[c.id] = i + 1;
  });

  const rankedLeaderboard = leaderboard.map((coach) => ({
    ...coach,
    sessionRank: sessionRankMap[coach.id] || leaderboard.length,
    earningsRank: earningsRankMap[coach.id] || leaderboard.length,
    ratingRank: ratingRankMap[coach.id] ?? null,
    isOnFire: coach.thisMonthSessions >= 3,
  }));

  return NextResponse.json({
    leaderboard: rankedLeaderboard,
    totalCoaches: leaderboard.length,
  });
}
