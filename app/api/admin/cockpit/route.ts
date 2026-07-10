import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { APP_TIMEZONE } from '@/lib/format-date';
import { COACH_REVENUE_FRACTION, normalizeCoachRevenueShareRate } from '@/lib/pricing';
import {
  parseCockpitPeriod,
  resolveCockpitRange,
  todayYmdInTz,
  type CockpitPeriod,
} from '@/lib/cockpit-date-ranges';
import {
  bucketCountsByRanges,
  bucketSumAmountPaidByRanges,
  cumulativeAmountPaidAtRangeEnds,
  cumulativeCountsAtRangeEnds,
} from '@/lib/cockpit-trend-queries';
import { fetchVercelWebAnalyticsTotals, vercelAnalyticsTokenConfigured } from '@/lib/fetch-vercel-web-analytics';

/**
 * GET /api/admin/cockpit?date=YYYY-MM-DD&period=today|week|month|90d|year&timezone=America/New_York
 * Legacy: range=today|week|month and trendPeriod=7d|90d|3w|12m still accepted.
 * All dates/times are Eastern (EST/EDT). "Today" = current Eastern calendar day.
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (userData?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const periodParam = searchParams.get('period');
    const rangeParam = searchParams.get('range');
    const rawTrend = searchParams.get('trendPeriod');
    const tz = searchParams.get('timezone') || APP_TIMEZONE;
    const todayEastern = todayYmdInTz(tz);
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayEastern;
    const period: CockpitPeriod = parseCockpitPeriod(periodParam, rangeParam, rawTrend);

    const {
      rangeStart,
      rangeEnd,
      dayStart,
      dayEnd,
      trendRanges,
    } = resolveCockpitRange(period, date, tz);

    const startMs = new Date(dayStart).getTime();
    const endMs = new Date(dayEnd).getTime();

    const admin = createAdminClient(tenant.slug);

    // Legacy field for older clients
    const range = period === 'week' || period === 'month' ? period : 'today';
    const trendPeriod =
      period === '90d' ? '90d' : period === 'year' ? '12m' : period === 'month' ? '3w' : '7d';

    const [
      newParentsRes,
      newCoachesRes,
      newAthletesRes,
      sessionsScheduledRes,
      bookingsRes,
      payoutsPaidRes,
      reviewsInPeriodRes,
      vercelAnalyticsResult,
      cumParentTsRes,
      cumCoachTsRes,
      cumAthleteTsRes,
      cumSessionTsRes,
      cumBookingRowsRes,
      cumReviewTsRes,
      cumNullAthleteTsRes,
      payoutsAllTimeRes,
      creditsOutstandingRes,
      creditsIssuedRes,
      creditsUsedRes,
    ] = await Promise.all([
      admin.from('users').select('id, email, created_at').eq('role', 'parent').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('athletes').select('id, first_name, last_name, school, created_at').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('youth_wrestlers').select('id, first_name, last_name, parent_id, created_at').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('sessions').select('id, scheduled_datetime, status, session_type, session_mode, current_participants, max_participants, created_at, athletes(first_name, last_name, school), facilities(name)').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('session_participants').select('id, session_id, parent_id, youth_wrestler_id, amount_paid, stripe_fee, created_at, youth_wrestlers(first_name, last_name), sessions(id, scheduled_datetime, athletes(first_name, last_name), facilities(name))').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('sessions').select('id, athlete_payment, athlete_payout_date, athletes(first_name, last_name)').eq('status', 'completed').gte('athlete_payout_date', rangeStart).lte('athlete_payout_date', rangeEnd),
      admin.from('reviews').select('id, rating, comment, created_at, parent_id, athlete_id, athletes(first_name, last_name)').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      fetchVercelWebAnalyticsTotals(rangeStart, rangeEnd),
      admin.from('users').select('created_at').eq('role', 'parent').lte('created_at', dayEnd).limit(100000),
      admin.from('athletes').select('created_at').lte('created_at', dayEnd).limit(100000),
      admin.from('youth_wrestlers').select('created_at').not('created_at', 'is', null).lte('created_at', dayEnd).limit(100000),
      admin.from('sessions').select('created_at').lte('created_at', dayEnd).limit(100000),
      admin.from('session_participants').select('amount_paid, created_at').lte('created_at', dayEnd).limit(100000),
      admin.from('reviews').select('created_at').lte('created_at', dayEnd).limit(100000),
      admin.from('youth_wrestlers').select('id', { count: 'exact', head: true }).is('created_at', null),
      admin.from('sessions').select('athlete_payment').eq('status', 'completed').not('athlete_payout_date', 'is', null),
      admin.from('credits').select('amount').is('used_at', null).gt('expires_at', new Date().toISOString()),
      admin.from('credits').select('amount').gte('created_at', dayStart).lte('created_at', dayEnd),
      admin.from('credits').select('amount').gte('used_at', dayStart).lte('used_at', dayEnd),
    ]);

    // Traffic: Vercel Web Analytics API (matches dashboard). Drain only when no token configured.
    let pageViews = 0;
    let visitors = 0;
    let periodUniqueDevices = 0;
    let visitorsCapped = false;
    let analyticsDataSinceMs: number | null = null;
    let analyticsRowsWithoutKey = 0;
    let analyticsSource: 'vercel_api' | 'drain' | 'none' = 'none';
    let analyticsApiError: string | null = null;

    if (vercelAnalyticsResult.ok) {
      pageViews = vercelAnalyticsResult.pageViews;
      visitors = vercelAnalyticsResult.visitors;
      analyticsSource = 'vercel_api';
    } else {
      analyticsApiError = vercelAnalyticsResult.reason;
      if (!vercelAnalyticsTokenConfigured()) {
        try {
          const { data: analyticsRows } = await admin
            .from('vercel_analytics_events')
            .select('device_id, session_id, timestamp_ms')
            .eq('event_type', 'pageview')
            .gte('timestamp_ms', startMs)
            .lte('timestamp_ms', endMs)
            .order('timestamp_ms', { ascending: true })
            .limit(100_000);
          const { summarizeCockpitAnalytics } = await import('@/lib/cockpit-vercel-analytics');
          const rows = (analyticsRows ?? []) as {
            device_id?: number | null;
            session_id?: number | null;
            timestamp_ms: number;
          }[];
          const summary = summarizeCockpitAnalytics(
            rows.map((r) => ({
              device_id: r.device_id ?? null,
              session_id: r.session_id ?? null,
              timestamp_ms: r.timestamp_ms,
            })),
            rows.length >= 100_000
          );
          pageViews = summary.pageViews;
          visitors = summary.visitors;
          periodUniqueDevices = summary.periodUniqueDevices;
          visitorsCapped = summary.visitorsCapped;
          analyticsDataSinceMs = summary.dataSinceMs;
          analyticsRowsWithoutKey = summary.rowsWithoutVisitorKey;
          if (pageViews > 0 || visitors > 0) analyticsSource = 'drain';
        } catch {
          // Table may not exist yet or drain not configured
        }
      }
    }

    const sumAmounts = (rows: { amount?: number | null }[] | null | undefined) =>
      (rows ?? []).reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
    const outstandingCredits = sumAmounts(creditsOutstandingRes.data as { amount?: number }[]);
    const creditsIssuedInRange = sumAmounts(creditsIssuedRes.data as { amount?: number }[]);
    const creditsUsedInRange = sumAmounts(creditsUsedRes.data as { amount?: number }[]);

    // Revenue: sum of amount_paid for participants created in range (each signup row).
    // Stripe fees live on session_participants (cart/register webhooks) — sessions.stripe_fee /
    // sessions.org_fee stay 0 for most open-session bookings and must not be used here.
    // Coach / Guild shares are applied to *period* gross only (never full-session athlete_payment).
    const bookingRowsRaw = bookingsRes.data ?? [];
    let revenueThatDay = 0;
    let stripeFeesTotal = 0;
    const sessionIdsForEconomics = new Set<string>();
    /** Gross from booking rows in this period, per session. */
    const grossBySessionInPeriod = new Map<string, number>();
    for (const b of bookingRowsRaw as {
      session_id?: string;
      amount_paid?: number | null;
      stripe_fee?: number | null;
    }[]) {
      if (b.session_id) sessionIdsForEconomics.add(b.session_id);
      const amt = b.amount_paid;
      if (amt != null && Number(amt) > 0) {
        const n = Number(amt);
        revenueThatDay += n;
        if (b.session_id) {
          grossBySessionInPeriod.set(b.session_id, (grossBySessionInPeriod.get(b.session_id) ?? 0) + n);
        }
      }
      const fee = Number(b.stripe_fee ?? 0);
      if (!Number.isNaN(fee) && fee > 0) stripeFeesTotal += fee;
    }
    const bookingCount = bookingRowsRaw.length;
    let paidBookingCount = 0;
    for (const b of bookingRowsRaw as { amount_paid?: number | null }[]) {
      const amt = b.amount_paid;
      if (amt != null && Number(amt) > 0) paidBookingCount += 1;
    }

    let coachPayoutsAllocated = 0;
    const sessionIdList = [...sessionIdsForEconomics];
    if (sessionIdList.length > 0) {
      const { data: sessFin } = await admin
        .from('sessions')
        .select('id, session_payout_rate')
        .in('id', sessionIdList);
      const rateBySession = new Map<string, number>();
      for (const s of sessFin ?? []) {
        const row = s as { id: string; session_payout_rate?: number | null };
        rateBySession.set(row.id, normalizeCoachRevenueShareRate(row.session_payout_rate));
      }
      for (const [sessionId, periodGross] of grossBySessionInPeriod) {
        const rate = rateBySession.get(sessionId) ?? COACH_REVENUE_FRACTION;
        coachPayoutsAllocated += Math.round(periodGross * rate * 100) / 100;
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    // Guild net after Stripe = period gross − coach share − Stripe fees (closes the books).
    const guildNetAfterStripe = round2(revenueThatDay - coachPayoutsAllocated - stripeFeesTotal);
    const remainderAfterModel = round2(
      revenueThatDay - coachPayoutsAllocated - stripeFeesTotal - guildNetAfterStripe
    );

    const bookingEconomics = {
      bookingCount,
      paidBookingCount,
      gross: revenueThatDay,
      coachPayouts: round2(coachPayoutsAllocated),
      stripeFees: round2(stripeFeesTotal),
      /** Guild platform take after Stripe (not sessions.org_fee — that column is unused for cart). */
      guildOrgFees: guildNetAfterStripe,
      /** Should be ~0; non-zero means rounding drift only. */
      remainder: remainderAfterModel,
    };

    const payoutsPaid = (payoutsPaidRes.data ?? []).reduce((sum: number, s: { athlete_payment?: number }) => sum + Number(s.athlete_payment ?? 0), 0);
    const payoutsPaidList = (payoutsPaidRes.data ?? []).map((s: { id: string; athlete_payment?: number; athletes?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] }) => {
      const a = s.athletes;
      const o = Array.isArray(a) ? a[0] : a;
      return { session_id: s.id, amount: Number(s.athlete_payment ?? 0), coach_name: o ? `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() : '—' };
    });

    const payoutsPaidAllTime = (payoutsAllTimeRes.data ?? []).reduce(
      (sum: number, s: { athlete_payment?: number | null }) => sum + Number(s.athlete_payment ?? 0),
      0
    );

    const parentTs = (newParentsRes.data ?? []).map((p: { created_at: string }) => p.created_at);
    const coachTs = (newCoachesRes.data ?? []).map((a: { created_at: string }) => a.created_at);
    const athleteTs = (newAthletesRes.data ?? []).map((y: { created_at: string }) => y.created_at);
    const sessionTs = (sessionsScheduledRes.data ?? []).map((s: { created_at: string }) => s.created_at);
    const bookingTs = (bookingsRes.data ?? []).map((b: { created_at: string }) => b.created_at);
    const reviewTs = (reviewsInPeriodRes.data ?? []).map((r: { created_at: string }) => r.created_at);
    const bookingAmountRows = (bookingsRes.data ?? []) as { amount_paid?: number | null; created_at: string }[];

    const trends = {
      parents: bucketCountsByRanges(parentTs, trendRanges),
      coaches: bucketCountsByRanges(coachTs, trendRanges),
      athletes: bucketCountsByRanges(athleteTs, trendRanges),
      sessions: bucketCountsByRanges(sessionTs, trendRanges),
      bookings: bucketCountsByRanges(bookingTs, trendRanges),
      bookingGross: bucketSumAmountPaidByRanges(bookingAmountRows, trendRanges),
      reviews: bucketCountsByRanges(reviewTs, trendRanges),
    };

    const nullAthleteCount = cumNullAthleteTsRes.count ?? 0;
    const cumBookingRows = (cumBookingRowsRes.data ?? []) as { amount_paid?: number | null; created_at: string | null }[];

    const trendCumulativeTotals = {
      parents: cumulativeCountsAtRangeEnds(
        (cumParentTsRes.data ?? []).map((r: { created_at: string }) => r.created_at),
        trendRanges
      ),
      coaches: cumulativeCountsAtRangeEnds(
        (cumCoachTsRes.data ?? []).map((r: { created_at: string }) => r.created_at),
        trendRanges
      ),
      athletes: cumulativeCountsAtRangeEnds(
        (cumAthleteTsRes.data ?? []).map((r: { created_at: string }) => r.created_at),
        trendRanges,
        nullAthleteCount
      ),
      sessions: cumulativeCountsAtRangeEnds(
        (cumSessionTsRes.data ?? []).map((r: { created_at: string }) => r.created_at),
        trendRanges
      ),
      bookings: cumulativeCountsAtRangeEnds(
        cumBookingRows.map((r) => r.created_at),
        trendRanges
      ),
      bookingGross: cumulativeAmountPaidAtRangeEnds(cumBookingRows, trendRanges),
      reviews: cumulativeCountsAtRangeEnds(
        (cumReviewTsRes.data ?? []).map((r: { created_at: string }) => r.created_at),
        trendRanges
      ),
    };

    const trendLabels = trendRanges.map((r) => r.label);
    const trendDaysForResponse = trendRanges.map((r) => r.start.slice(0, 10));

    const reviewsRaw = (reviewsInPeriodRes.data ?? []) as Array<{
      id: string; rating: number; comment: string | null; created_at: string; parent_id: string; athlete_id: string;
      athletes?: { first_name: string; last_name: string } | { first_name: string; last_name: string }[];
    }>;
    const reviewParentIds = [...new Set(reviewsRaw.map((r) => r.parent_id))];
    const { data: reviewParents } = reviewParentIds.length > 0
      ? await admin.from('users').select('id, email').in('id', reviewParentIds)
      : { data: [] };
    const parentEmailById = new Map((reviewParents ?? []).map((u: { id: string; email: string }) => [u.id, u.email]));
    const trendDetailReviews = reviewsRaw.map((r) => {
      const a = r.athletes;
      const o = Array.isArray(a) ? a[0] : a;
      return {
        id: r.id,
        athlete_id: r.athlete_id,
        coach_name: o ? `${o.first_name} ${o.last_name}`.trim() : '—',
        reviewed_by: parentEmailById.get(r.parent_id) ?? '—',
        rating: r.rating,
        comment: r.comment ?? '',
        created_at: r.created_at,
      };
    });

    const newParents = (newParentsRes.data ?? []).map((p: { id: string; email: string; created_at: string }) => ({ id: p.id, email: p.email, created_at: p.created_at }));
    const newCoaches = (newCoachesRes.data ?? []).map((a: { id: string; first_name: string; last_name: string; school: string; created_at: string }) => ({
      id: a.id, name: `${a.first_name} ${a.last_name}`.trim(), school: a.school ?? '', created_at: a.created_at,
    }));
    const newAthletes = (newAthletesRes.data ?? []).map((y: { id: string; first_name: string; last_name: string; parent_id: string; created_at: string }) => ({
      id: y.id, name: `${y.first_name} ${y.last_name}`.trim(), parent_id: y.parent_id, created_at: y.created_at,
    }));

    const sessionsScheduled = (sessionsScheduledRes.data ?? []).map((s: {
      id: string; scheduled_datetime: string; status: string; session_type?: string; session_mode?: string; current_participants?: number; max_participants?: number;
      athletes?: { first_name: string; last_name: string; school: string } | { first_name: string; last_name: string; school: string }[];
      facilities?: { name: string } | { name: string }[];
    }) => {
      const a = s.athletes;
      const o = Array.isArray(a) ? a[0] : a;
      const f = s.facilities;
      const fo = Array.isArray(f) ? f[0] : f;
      return {
        id: s.id,
        scheduled_datetime: s.scheduled_datetime,
        status: s.status,
        session_type: s.session_type ?? '—',
        session_mode: s.session_mode ?? '—',
        coach_name: o ? `${o.first_name} ${o.last_name}` : '—',
        facility_name: fo?.name ?? '—',
        participants: `${s.current_participants ?? 0}/${s.max_participants ?? 1}`,
      };
    });

    const bookings = ((bookingsRes.data ?? []) as Array<{
      id: string;
      session_id: string;
      youth_wrestler_id?: string | null;
      amount_paid?: number | null;
      created_at: string;
      youth_wrestlers?: { first_name?: string; last_name?: string } | Array<{ first_name?: string; last_name?: string }> | null;
      sessions?: unknown;
    }>).map((b) => {
      const yw = b.youth_wrestlers;
      const ywOne = Array.isArray(yw) ? yw[0] : yw;
      const kid_name = ywOne ? `${ywOne.first_name ?? ''} ${ywOne.last_name ?? ''}`.trim() || '—' : '—';
      const sess = b.sessions as { scheduled_datetime?: string; athletes?: { first_name?: string; last_name?: string } | Array<{ first_name?: string; last_name?: string }>; facilities?: { name?: string } | Array<{ name?: string }> } | Array<{ scheduled_datetime?: string; athletes?: unknown; facilities?: unknown }> | null | undefined;
      const s = Array.isArray(sess) ? sess[0] : sess;
      const a = s?.athletes;
      const o = Array.isArray(a) ? a[0] : a;
      const f = s?.facilities;
      const fo = Array.isArray(f) ? f[0] : f;
      return {
        id: b.id,
        session_id: b.session_id,
        amount_paid: b.amount_paid != null ? Number(b.amount_paid) : null,
        created_at: b.created_at,
        kid_name,
        coach_name: o ? `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || '—' : '—',
        facility_name: fo?.name ?? '—',
        scheduled_datetime: s?.scheduled_datetime ?? '—',
      };
    });

    const trendDetailParents = newParents;
    const trendDetailCoaches = newCoaches;
    const trendDetailAthletes = newAthletes;
    const trendDetailSessions = sessionsScheduled;
    const trendDetailBookings = bookings;

    const kpiCounts = {
      bookings: bookingCount,
      paidBookings: paidBookingCount,
      parents: newParents.length,
      coaches: newCoaches.length,
      athletes: newAthletes.length,
      sessions: sessionsScheduled.length,
      reviews: reviewsRaw.length,
    };

    return NextResponse.json({
      date,
      period,
      range,
      rangeStart,
      rangeEnd,
      pageViews,
      visitors,
      periodUniqueDevices,
      visitorsCapped,
      analyticsDataSinceMs,
      analyticsRowsWithoutKey,
      analyticsSource,
      analyticsApiError,
      kpiCounts,
      newParents,
      newCoaches,
      newAthletes,
      sessionsScheduled,
      bookings,
      payoutsPaid,
      payoutsPaidAllTime,
      payoutsPaidList,
      revenueThatDay,
      bookingEconomics,
      // Credits (liability for reschedules/cancellations)
      outstandingCredits,
      creditsIssuedInRange,
      creditsUsedInRange,
      trends,
      trendCumulativeTotals,
      trendDays: trendDaysForResponse,
      trendLabels,
      trendPeriod,
      trendDetailParents,
      trendDetailCoaches,
      trendDetailAthletes,
      trendDetailSessions,
      trendDetailBookings,
      trendDetailReviews,
    });
  } catch (e) {
    console.error('Cockpit API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
