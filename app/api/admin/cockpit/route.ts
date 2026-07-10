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
      trendParentsRes,
      trendCoachesRes,
      trendAthletesRes,
      trendSessionsRes,
      trendBookingsRes,
      trendReviewsRes,
    ] = await Promise.all([
      admin.from('users').select('id, email, created_at').eq('role', 'parent').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('athletes').select('id, first_name, last_name, school, created_at').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('youth_wrestlers').select('id, first_name, last_name, parent_id, created_at').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('sessions').select('id, scheduled_datetime, status, session_type, session_mode, current_participants, max_participants, athletes(first_name, last_name, school), facilities(name)').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('session_participants').select('id, session_id, parent_id, youth_wrestler_id, amount_paid, stripe_fee, created_at, youth_wrestlers(first_name, last_name), sessions(id, scheduled_datetime, athletes(first_name, last_name), facilities(name))').gte('created_at', dayStart).lte('created_at', dayEnd).order('created_at', { ascending: false }),
      admin.from('sessions').select('id, athlete_payment, athlete_payout_date, athletes(first_name, last_name)').eq('status', 'completed').gte('athlete_payout_date', rangeStart).lte('athlete_payout_date', rangeEnd),
      trendCountByRanges(admin, 'users', 'parent', trendRanges),
      trendCountByRanges(admin, 'athletes', null, trendRanges),
      trendCountByRanges(admin, 'youth_wrestlers', null, trendRanges),
      trendCountByRanges(admin, 'sessions', null, trendRanges),
      trendCountByRanges(admin, 'session_participants', null, trendRanges),
      trendCountByRanges(admin, 'reviews', null, trendRanges),
    ]);

    // Vercel Analytics (drain): page views and unique visitors in range (origin matches tenant domain or request host for previews)
    let pageViews = 0;
    let visitors = 0;
    try {
      const requestHost = host.replace(/^https?:\/\//, '').split(':')[0];
      const orFilter = `origin.ilike.%${tenant.domain}%,origin.ilike.%${requestHost}%`;
      const { data: analyticsRows } = await admin
        .from('vercel_analytics_events')
        .select('event_type, device_id')
        .gte('timestamp_ms', startMs)
        .lte('timestamp_ms', endMs)
        .or(orFilter)
        .limit(100000);
      if (analyticsRows && analyticsRows.length > 0) {
        const rows = analyticsRows as { event_type?: string; device_id?: number | null }[];
        pageViews = rows.filter((r) => r.event_type === 'pageview').length;
        const deviceIds = new Set(rows.map((r) => r.device_id).filter((id): id is number => id != null));
        visitors = deviceIds.size;
      }
    } catch {
      // Table may not exist yet or drain not configured
    }

    // Credits: total outstanding (unused, non-expired) credits owed to parents
    let outstandingCredits = 0;
    let creditsIssuedInRange = 0;
    let creditsUsedInRange = 0;
    try {
      // Total outstanding credits (liability)
      const { data: creditsData } = await admin
        .from('credits')
        .select('amount')
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString());
      outstandingCredits = (creditsData ?? []).reduce((sum: number, c: { amount: number }) => sum + Number(c.amount), 0);
      
      // Credits issued in range
      const { data: issuedData } = await admin
        .from('credits')
        .select('amount')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);
      creditsIssuedInRange = (issuedData ?? []).reduce((sum: number, c: { amount: number }) => sum + Number(c.amount), 0);
      
      // Credits used in range
      const { data: usedData } = await admin
        .from('credits')
        .select('amount')
        .gte('used_at', dayStart)
        .lte('used_at', dayEnd);
      creditsUsedInRange = (usedData ?? []).reduce((sum: number, c: { amount: number }) => sum + Number(c.amount), 0);
    } catch {
      // user_credits table may not exist
    }

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

    /** All completed sessions ever marked paid (not limited to cockpit period) */
    const { data: payoutsAllTimeRows } = await admin
      .from('sessions')
      .select('athlete_payment')
      .eq('status', 'completed')
      .not('athlete_payout_date', 'is', null);
    const payoutsPaidAllTime = (payoutsAllTimeRows ?? []).reduce(
      (sum: number, s: { athlete_payment?: number | null }) => sum + Number(s.athlete_payment ?? 0),
      0
    );

    const [trendBookingGrossRes, cumBookingGrossRes] = await Promise.all([
      trendSumAmountPaidByRanges(admin, trendRanges),
      cumulativeBookingGrossAtRangeEnds(admin, trendRanges),
    ]);

    const trends = {
      parents: trendParentsRes,
      coaches: trendCoachesRes,
      athletes: trendAthletesRes,
      sessions: trendSessionsRes,
      bookings: trendBookingsRes,
      bookingGross: trendBookingGrossRes,
      reviews: trendReviewsRes,
    };

    const trendLabels = trendRanges.map((r) => r.label);
    const trendDaysForResponse = trendRanges.map((r) => r.start.slice(0, 10));

    /** All-time count at end of each bucket (created_at <= period end) — monotone growth curves */
    const [
      cumParentsRes,
      cumCoachesRes,
      cumAthletesRes,
      cumSessionsRes,
      cumBookingsRes,
      cumReviewsRes,
    ] = await Promise.all([
      cumulativeTotalsAtRangeEnds(admin, 'users', 'parent', trendRanges),
      cumulativeTotalsAtRangeEnds(admin, 'athletes', null, trendRanges),
      cumulativeYouthWrestlersAtRangeEnds(admin, trendRanges),
      cumulativeTotalsAtRangeEnds(admin, 'sessions', null, trendRanges),
      cumulativeTotalsAtRangeEnds(admin, 'session_participants', null, trendRanges),
      cumulativeTotalsAtRangeEnds(admin, 'reviews', null, trendRanges),
    ]);

    const trendCumulativeTotals = {
      parents: cumParentsRes,
      coaches: cumCoachesRes,
      athletes: cumAthletesRes,
      sessions: cumSessionsRes,
      bookings: cumBookingsRes,
      bookingGross: cumBookingGrossRes,
      reviews: cumReviewsRes,
    };

    // Detail records for the full trend period (so table below chart shows list for selected metric)
    const trendStart = trendRanges[0]?.start ?? dayStart;
    const trendEnd = trendRanges[trendRanges.length - 1]?.end ?? dayEnd;
    const [
      trendDetailParentsRes,
      trendDetailCoachesRes,
      trendDetailAthletesRes,
      trendDetailSessionsRes,
      trendDetailBookingsRes,
      trendDetailReviewsRes,
    ] = await Promise.all([
      admin.from('users').select('id, email, created_at').eq('role', 'parent').gte('created_at', trendStart).lte('created_at', trendEnd).order('created_at', { ascending: false }),
      admin.from('athletes').select('id, first_name, last_name, school, created_at').gte('created_at', trendStart).lte('created_at', trendEnd).order('created_at', { ascending: false }),
      admin.from('youth_wrestlers').select('id, first_name, last_name, parent_id, created_at').gte('created_at', trendStart).lte('created_at', trendEnd).order('created_at', { ascending: false }),
      admin.from('sessions').select('id, scheduled_datetime, status, session_type, session_mode, current_participants, max_participants, athletes(first_name, last_name, school), facilities(name)').gte('created_at', trendStart).lte('created_at', trendEnd).order('created_at', { ascending: false }),
      admin.from('session_participants').select('id, session_id, parent_id, youth_wrestler_id, amount_paid, created_at, youth_wrestlers(first_name, last_name), sessions(id, scheduled_datetime, athletes(first_name, last_name), facilities(name))').gte('created_at', trendStart).lte('created_at', trendEnd).order('created_at', { ascending: false }),
      admin.from('reviews').select('id, rating, comment, created_at, parent_id, athlete_id, athletes(first_name, last_name)').gte('created_at', trendStart).lte('created_at', trendEnd).order('created_at', { ascending: false }),
    ]);

    const trendDetailParents = (trendDetailParentsRes.data ?? []).map((p: { id: string; email: string; created_at: string }) => ({ id: p.id, email: p.email, created_at: p.created_at }));
    const trendDetailCoaches = (trendDetailCoachesRes.data ?? []).map((a: { id: string; first_name: string; last_name: string; school: string; created_at: string }) => ({
      id: a.id, name: `${a.first_name} ${a.last_name}`.trim(), school: a.school ?? '', created_at: a.created_at,
    }));
    const trendDetailAthletes = (trendDetailAthletesRes.data ?? []).map((y: { id: string; first_name: string; last_name: string; parent_id: string; created_at: string }) => ({
      id: y.id, name: `${y.first_name} ${y.last_name}`.trim(), parent_id: y.parent_id, created_at: y.created_at,
    }));
    const trendDetailSessions = (trendDetailSessionsRes.data ?? []).map((s: {
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
    const trendDetailBookings = ((trendDetailBookingsRes.data ?? []) as Array<{
      id: string; session_id: string; amount_paid?: number | null; created_at: string;
      youth_wrestlers?: { first_name?: string; last_name?: string } | Array<{ first_name?: string; last_name?: string }> | null;
      sessions?: { scheduled_datetime?: string; athletes?: { first_name?: string; last_name?: string } | Array<{ first_name?: string; last_name?: string }>; facilities?: { name?: string } | Array<{ name?: string }> } | null;
    }>).map((b) => {
      const yw = b.youth_wrestlers;
      const ywOne = Array.isArray(yw) ? yw[0] : yw;
      const kid_name = ywOne ? `${ywOne.first_name ?? ''} ${ywOne.last_name ?? ''}`.trim() || '—' : '—';
      const sess = b.sessions;
      const s = Array.isArray(sess) ? sess?.[0] : sess;
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
    const reviewsRaw = (trendDetailReviewsRes.data ?? []) as Array<{
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

    return NextResponse.json({
      date,
      period,
      range,
      rangeStart,
      rangeEnd,
      pageViews,
      visitors,
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

async function trendCountByRanges(
  admin: ReturnType<typeof createAdminClient>,
  table: 'users' | 'athletes' | 'youth_wrestlers' | 'sessions' | 'session_participants' | 'reviews',
  role: string | null,
  ranges: { start: string; end: string }[]
): Promise<number[]> {
  const counts: number[] = [];
  for (const { start, end } of ranges) {
    const base = (admin as any).from(table).select('*', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end);
    const q = table === 'users' && role != null ? base.eq('role', role) : base;
    const { count, error } = await q;
    counts.push(error ? 0 : (count ?? 0));
  }
  return counts;
}

/** Total rows ever created with created_at <= end of each bucket (platform growth over time). */
async function cumulativeTotalsAtRangeEnds(
  admin: ReturnType<typeof createAdminClient>,
  table: 'users' | 'athletes' | 'youth_wrestlers' | 'sessions' | 'session_participants' | 'reviews',
  role: string | null,
  ranges: { start: string; end: string }[]
): Promise<number[]> {
  const counts: number[] = [];
  for (const { end } of ranges) {
    const base = (admin as any).from(table).select('*', { count: 'exact', head: true }).lte('created_at', end);
    const q = table === 'users' && role != null ? base.eq('role', role) : base;
    const { count, error } = await q;
    counts.push(error ? 0 : (count ?? 0));
  }
  return counts;
}

/**
 * Kids cumulative count: rows with created_at <= end OR created_at IS NULL (legacy imports).
 * Plain .lte(created_at) excludes NULL and undercounted (e.g. chart showed ~30 vs 37 real kids).
 */
async function cumulativeYouthWrestlersAtRangeEnds(
  admin: ReturnType<typeof createAdminClient>,
  ranges: { start: string; end: string }[]
): Promise<number[]> {
  const { count: nullCount, error: nullErr } = await admin
    .from('youth_wrestlers')
    .select('*', { count: 'exact', head: true })
    .is('created_at', null);
  const nNull = nullErr ? 0 : (nullCount ?? 0);

  const counts: number[] = [];
  for (const { end } of ranges) {
    const { count, error } = await admin
      .from('youth_wrestlers')
      .select('*', { count: 'exact', head: true })
      .not('created_at', 'is', null)
      .lte('created_at', end);
    counts.push((error ? 0 : (count ?? 0)) + nNull);
  }
  return counts;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Gross parent payments (sum amount_paid) per trend bucket for session_participants in that window. */
async function trendSumAmountPaidByRanges(
  admin: ReturnType<typeof createAdminClient>,
  ranges: { start: string; end: string }[]
): Promise<number[]> {
  if (ranges.length === 0) return [];
  const minStart = ranges[0].start;
  const maxEnd = ranges[ranges.length - 1].end;
  const { data, error } = await admin
    .from('session_participants')
    .select('amount_paid, created_at')
    .gte('created_at', minStart)
    .lte('created_at', maxEnd)
    .limit(100000);
  if (error || !data) return ranges.map(() => 0);
  const rows = data as { amount_paid?: number | null; created_at: string }[];
  return ranges.map(({ start, end }) => {
    const t0 = new Date(start).getTime();
    const t1 = new Date(end).getTime();
    let s = 0;
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (t >= t0 && t <= t1) s += Number(r.amount_paid ?? 0);
    }
    return roundMoney(s);
  });
}

/** Cumulative sum of amount_paid for all booking rows with created_at <= bucket end (or null timestamp). */
async function cumulativeBookingGrossAtRangeEnds(
  admin: ReturnType<typeof createAdminClient>,
  ranges: { start: string; end: string }[]
): Promise<number[]> {
  if (ranges.length === 0) return [];
  const maxEnd = ranges[ranges.length - 1].end;
  const [{ data: datedRows, error: e1 }, { data: nullRows, error: e2 }] = await Promise.all([
    admin
      .from('session_participants')
      .select('amount_paid, created_at')
      .not('created_at', 'is', null)
      .lte('created_at', maxEnd)
      .limit(100000),
    admin.from('session_participants').select('amount_paid, created_at').is('created_at', null).limit(10000),
  ]);
  if (e1 && e2) return ranges.map(() => 0);
  const rows = [
    ...((datedRows ?? []) as { amount_paid?: number | null; created_at: string }[]),
    ...((nullRows ?? []) as { amount_paid?: number | null; created_at: string | null }[]),
  ];
  return ranges.map(({ end }) => {
    const tEnd = new Date(end).getTime();
    let s = 0;
    for (const r of rows) {
      if (r.created_at == null) {
        s += Number(r.amount_paid ?? 0);
        continue;
      }
      if (new Date(r.created_at).getTime() <= tEnd) s += Number(r.amount_paid ?? 0);
    }
    return roundMoney(s);
  });
}
