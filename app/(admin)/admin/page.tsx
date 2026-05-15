import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

/** Always show latest sessions after creating/editing (avoid cached RSC missing new rows). */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import {
  AdminDashboardClient,
  type AdminSession,
  type AdminUser,
  type BillingSummary,
  type AthleteReport,
  type CoachPayout,
  type CreditRecord,
  type YouthSessionSpendLine,
  type RecentSignupRow,
} from './admin-dashboard-client';
import { coachPayoutUsd, type SessionCoachPayoutFields } from '@/lib/coach-session-payout';
import { isRewardsProgramEnabled } from '@/lib/rewards';
import { formatEST } from '@/lib/format-date';
import { isBookingCheckoutShellSession } from '@/lib/session-checkout-shell';
import {
  isRecruitNcCreditRow,
  rollupRecruitNcGrantRowsUsd,
  type RecruitNcCreditTotals,
} from '@/lib/recruitnc-credit-admin-stats';

type SessionWithPayoutStatus = SessionCoachPayoutFields & { status: string; booking_checkout_shell?: boolean };

/** Open-booking counts: session calendar day in Eastern is today or later (matches admin Sessions filter). */
function isOpenSessionFromTodayForwardEastern(scheduledDatetime: string): boolean {
  const todayKey = formatEST(new Date(), 'yyyy-MM-dd');
  const sessionKey = formatEST(scheduledDatetime, 'yyyy-MM-dd');
  return sessionKey >= todayKey;
}

function coachPayoutUsdUnlessUnpaidPending(
  s: SessionWithPayoutStatus,
  participantSum: number
): number {
  if (s.booking_checkout_shell && participantSum <= 0) return 0;
  return coachPayoutUsd({
    athlete_payment: s.athlete_payment,
    price_per_participant: s.price_per_participant,
    current_participants: s.current_participants,
    participant_amount_paid_sum: participantSum,
    session_payout_rate: s.session_payout_rate ?? null,
    coach_payout_rate: s.coach_payout_rate ?? null,
  });
}

function sessionCoachShareUsd(s: AdminSession): number {
  return coachPayoutUsdUnlessUnpaidPending(
    { ...s, booking_checkout_shell: s.booking_checkout_shell },
    s.participant_amount_paid_sum ?? 0
  );
}

function roundRatingAvg(sum: number, count: number): number {
  return Math.round((sum / count) * 100) / 100;
}

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  return new Set(
    raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  );
}

export default async function AdminPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    const adminEmails = getAdminEmails();
    const emailLower = (user.email ?? '').toLowerCase();
    if (adminEmails.has(emailLower)) {
      try {
        const admin = createAdminClient(tenant.slug);
        const { error } = await admin
          .from('users')
          .update({ role: 'admin' })
          .eq('id', user.id);
        if (!error) redirect('/admin');
      } catch {
        /* ignore */
      }
    }
    if (userData?.role === 'parent') redirect('/browse');
    if (userData?.role === 'coach') redirect('/athlete-dashboard');
    redirect('/');
  }

  const admin = createAdminClient(tenant.slug);

  const [sessionsRes, usersRes, creditsRes, athletesRes, reviewsRes, youthWrestlersRes, allYouthNamesRes] =
    await Promise.all([
    admin
      .from('sessions')
      .select(`
        id,
        parent_id,
        athlete_id,
        scheduled_datetime,
        status,
        duration_minutes,
        total_price,
        athlete_payment,
        athlete_payout_date,
        org_fee,
        stripe_fee,
        session_type,
        session_mode,
        join_policy,
        focus_area,
        focus_area_2,
        partner_invite_code,
        current_participants,
        max_participants,
        price_per_participant,
        session_payout_rate,
        athletes(id, first_name, last_name, school, venmo_handle, zelle_email, payout_rate),
        facilities(id, name),
        session_participants(id, amount_paid, paid, youth_wrestler_id, stripe_fee)
      `)
      .order('scheduled_datetime', { ascending: false })
      .limit(10000),
    admin
      .from('users')
      .select('id, email, role, created_at, last_login_at, first_name, last_name')
      .order('created_at', { ascending: false }),
    admin
      .from('credits')
      .select('id, parent_id, amount, remaining, source, description, created_at, expires_at')
      .order('created_at', { ascending: false }),
    admin
      .from('athletes')
      .select('id, first_name, last_name, school, average_rating, review_count, active')
      .eq('status', 'active')
      .order('last_name'),
    admin.from('reviews').select('athlete_id, rating'),
    admin
      .from('youth_wrestlers')
      .select('id, first_name, last_name, parent_id, created_at')
      .order('created_at', { ascending: false })
      .limit(80),
    admin.from('youth_wrestlers').select('parent_id, first_name, last_name'),
  ]);

  if (usersRes.error) {
    console.error('Admin users fetch error:', usersRes.error);
  }
  const usersRows = (usersRes.data ?? []).map((u) => {
    const row = u as {
      id: string;
      email: string;
      role: string;
      created_at: string;
      last_login_at?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    };
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      created_at: row.created_at,
      last_login_at: row.last_login_at ?? null,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
    };
  });
  if (sessionsRes.error) {
    console.error('Admin sessions fetch error:', sessionsRes.error);
    console.error('Admin sessions error details:', JSON.stringify(sessionsRes.error, null, 2));
  }
  if (creditsRes.error) {
    console.error('Admin credits fetch error:', creditsRes.error);
  }
  if (athletesRes.error) {
    console.error('Admin athletes fetch error:', athletesRes.error);
  }
  if (reviewsRes.error) {
    console.error('Admin reviews fetch error:', reviewsRes.error);
  }
  if (youthWrestlersRes.error) {
    console.error('Admin youth_wrestlers fetch error:', youthWrestlersRes.error);
  }
  if (allYouthNamesRes.error) {
    console.error('Admin youth_wrestlers (all names) fetch error:', allYouthNamesRes.error);
  }

  const reviewAggByAthlete = new Map<string, { sum: number; count: number }>();
  for (const row of reviewsRes.data ?? []) {
    const r = row as { athlete_id?: string; rating?: number };
    const id = r.athlete_id;
    if (!id) continue;
    const rating = Number(r.rating);
    if (!Number.isFinite(rating)) continue;
    const prev = reviewAggByAthlete.get(id) ?? { sum: 0, count: 0 };
    prev.sum += rating;
    prev.count += 1;
    reviewAggByAthlete.set(id, prev);
  }

  

  const sessionsRows = (sessionsRes.data ?? []) as Array<{
    id: string;
    parent_id: string;
    athlete_id?: string;
    scheduled_datetime: string;
    status: string;
    total_price: number;
    athlete_payment: number;
    athlete_payout_date?: string | null;
    org_fee: number;
    stripe_fee: number;
    session_type?: string;
    session_mode?: string;
    partner_invite_code?: string | null;
    current_participants?: number | null;
    max_participants?: number | null;
    price_per_participant?: number | null;
    athletes?: { id: string; first_name: string; last_name: string; school: string; venmo_handle?: string | null; zelle_email?: string | null } | { id: string; first_name: string; last_name: string; school: string; venmo_handle?: string | null; zelle_email?: string | null }[];
    facilities?: { id: string; name: string } | { id: string; name: string }[];
    session_participants?: Array<{
      id?: string;
      amount_paid?: number | null;
      paid?: boolean | null;
      youth_wrestler_id?: string | null;
      stripe_fee?: number | null;
    }> | {
      id?: string;
      amount_paid?: number | null;
      paid?: boolean | null;
      youth_wrestler_id?: string | null;
      stripe_fee?: number | null;
    };
  }>;

  const emailByUserId = new Map(usersRows.map((u) => [u.id, u.email]));

  type ParticipantRow = {
    id?: string;
    amount_paid?: number | null;
    paid?: boolean | null;
    youth_wrestler_id?: string | null;
    stripe_fee?: number | null;
  };

  /** Money actually collected: exclude list-price placeholders on unpaid checkout rows. */
  function participantAmountPaidSum(s: (typeof sessionsRows)[0]): number {
    const shell = isBookingCheckoutShellSession(s);
    const raw = s.session_participants;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return rows.reduce((sum, p) => {
      const pr = p as ParticipantRow;
      const amt = Number(pr.amount_paid ?? 0);
      if (shell && pr.paid !== true) return sum;
      if (pr.paid === false) return sum;
      return sum + amt;
    }, 0);
  }

  /** Spots that count toward capacity (unpaid checkout shell rows do not hold a slot). */
  function confirmedBookedCount(s: (typeof sessionsRows)[0]): number {
    const shell = isBookingCheckoutShellSession(s);
    const raw = s.session_participants;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (shell) {
      return rows.filter((p) => (p as ParticipantRow).paid === true).length;
    }
    return rows.filter((p) => (p as ParticipantRow).paid !== false).length;
  }

  /** Youth roster spots (excludes explicit paid=false drop/cancel rows; includes unpaid checkout placeholders with a kid). */
  function youthParticipantSignupCount(s: (typeof sessionsRows)[0]): number {
    const raw = s.session_participants;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return rows.filter((p) => {
      const pr = p as ParticipantRow;
      if (pr.youth_wrestler_id == null || pr.youth_wrestler_id === '') return false;
      if (pr.paid === false) return false;
      return true;
    }).length;
  }
  
  // Calculate drop-in amount (participants with null youth_wrestler_id)
  function dropInAmount(s: (typeof sessionsRows)[0]): number {
    const raw = s.session_participants;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return rows
      .filter((p) => (p as ParticipantRow).youth_wrestler_id === null)
      .reduce((sum, p) => sum + Number((p as ParticipantRow).amount_paid ?? 0), 0);
  }
  
  function dropInCount(s: (typeof sessionsRows)[0]): number {
    const raw = s.session_participants;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return rows.filter((p) => (p as ParticipantRow).youth_wrestler_id === null).length;
  }
  
  // Sum of actual Stripe fees from session_participants
  function stripeFeeSum(s: (typeof sessionsRows)[0]): number {
    const raw = s.session_participants;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return rows.reduce((sum, p) => sum + Number((p as ParticipantRow).stripe_fee ?? 0), 0);
  }
  
  // Count actual participants from session_participants table (not stale counter)
  function actualParticipantCount(s: (typeof sessionsRows)[0]): number {
    const raw = s.session_participants;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return rows.length;
  }

  const youthSessionSpendLines: YouthSessionSpendLine[] = [];
  for (const s of sessionsRows) {
    const a = s.athletes;
    const coach = Array.isArray(a) ? a[0] : a;
    const coachName = coach ? `${coach.first_name} ${coach.last_name}`.trim() : '—';
    const f = s.facilities;
    const fo = Array.isArray(f) ? f[0] : f;
    const facilityName = fo?.name ?? '—';
    const raw = s.session_participants;
    const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const p of rows) {
      const pr = p as ParticipantRow;
      const yid = pr.youth_wrestler_id;
      if (yid == null || yid === '') continue;
      if (isBookingCheckoutShellSession(s) && pr.paid !== true) continue;
      if (pr.paid === false) continue;
      const amt = Math.round(Number(pr.amount_paid ?? 0) * 100) / 100;
      youthSessionSpendLines.push({
        youth_wrestler_id: yid,
        session_id: s.id,
        amount_paid: amt,
        scheduled_datetime: s.scheduled_datetime,
        session_status: s.status,
        session_type: s.session_type ?? undefined,
        coach_name: coachName,
        facility_name: facilityName,
      });
    }
  }
  youthSessionSpendLines.sort((a, b) => b.scheduled_datetime.localeCompare(a.scheduled_datetime));

  const sessions: AdminSession[] = sessionsRows.map((s) => {
    const a = s.athletes;
    const o = Array.isArray(a) ? a[0] : a;
    const f = s.facilities;
    const fo = Array.isArray(f) ? f[0] : f;
    const booking_checkout_shell = isBookingCheckoutShellSession(s);
    // Cast to access fields not in generated types
    const row = s as typeof s & { duration_minutes?: number; price_per_participant?: number; join_policy?: string; focus_area?: string; focus_area_2?: string };
    return {
      id: s.id,
      athlete_id: s.athlete_id ?? '',
      scheduled_datetime: s.scheduled_datetime,
      status: s.status,
      duration_minutes: row.duration_minutes ?? 60,
      total_price: Number(s.total_price ?? 0),
      athlete_payment: Number(s.athlete_payment ?? 0),
      org_fee: Number(s.org_fee ?? 0),
      stripe_fee: Number(s.stripe_fee ?? 0),
      session_type: s.session_type ?? undefined,
      session_mode: s.session_mode ?? undefined,
      join_policy: row.join_policy ?? 'public',
      focus_area: row.focus_area ?? null,
      focus_area_2: row.focus_area_2 ?? null,
      partner_invite_code: s.partner_invite_code ?? null,
      current_participants: actualParticipantCount(s),
      confirmed_booked_count: confirmedBookedCount(s),
      max_participants: s.max_participants ?? 1,
      price_per_participant: row.price_per_participant ?? 30,
      parent_id: s.parent_id,
      parent_email: emailByUserId.get(s.parent_id) ?? '—',
      athlete_name: o ? `${o.first_name} ${o.last_name}` : '—',
      athlete_school: o?.school ?? '—',
      facility_id: fo?.id ?? '',
      facility_name: fo?.name ?? '—',
      participant_amount_paid_sum: participantAmountPaidSum(s),
      drop_in_amount: dropInAmount(s),
      drop_in_count: dropInCount(s),
      stripe_fee_sum: stripeFeeSum(s),
      athlete_payout_date: s.athlete_payout_date ?? null,
      session_payout_rate:
        (s as { session_payout_rate?: number | null }).session_payout_rate ?? null,
      coach_payout_rate:
        o && (o as { payout_rate?: number | null }).payout_rate != null
          ? Number((o as { payout_rate?: number | null }).payout_rate)
          : null,
      booking_checkout_shell,
    };
  });

  const users: AdminUser[] = usersRows.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    created_at: u.created_at,
    last_login_at: u.last_login_at ?? null,
    first_name: u.first_name ?? null,
    last_name: u.last_name ?? null,
  }));

  const billing: BillingSummary = {
    totalRevenue: sessions.reduce((sum, s) => {
      if (s.booking_checkout_shell) return sum + (s.participant_amount_paid_sum ?? 0);
      return sum + s.total_price;
    }, 0),
    totalOrgFees: sessions.reduce((sum, s) => {
      if (s.booking_checkout_shell && (s.participant_amount_paid_sum ?? 0) <= 0) return sum;
      return sum + s.org_fee;
    }, 0),
    totalStripeFees: sessions.reduce((sum, s) => {
      if (s.booking_checkout_shell && (s.participant_amount_paid_sum ?? 0) <= 0) return sum;
      return sum + s.stripe_fee;
    }, 0),
    totalAthletePayments: sessions.reduce((sum, s) => sum + sessionCoachShareUsd(s), 0),
    upcomingOpenRevenue: sessions
      .filter((s) => s.status === 'scheduled' && isOpenSessionFromTodayForwardEastern(s.scheduled_datetime))
      .reduce((sum, s) => sum + s.total_price, 0),
    upcomingOpenOrgFees: sessions
      .filter((s) => s.status === 'scheduled' && isOpenSessionFromTodayForwardEastern(s.scheduled_datetime))
      .reduce((sum, s) => sum + s.org_fee, 0),
    upcomingOpenStripeFees: sessions
      .filter((s) => s.status === 'scheduled' && isOpenSessionFromTodayForwardEastern(s.scheduled_datetime))
      .reduce((sum, s) => sum + s.stripe_fee, 0),
    upcomingOpenAthletePayments: sessions
      .filter((s) => s.status === 'scheduled' && isOpenSessionFromTodayForwardEastern(s.scheduled_datetime))
      .reduce((sum, s) => sum + sessionCoachShareUsd(s), 0),
    sessionCount: sessions.length,
    completedCount: sessions.filter((s) => s.status === 'completed').length,
    pendingPaymentCount: sessions.filter(
      (s) => s.booking_checkout_shell && isOpenSessionFromTodayForwardEastern(s.scheduled_datetime)
    ).length,
    upcomingOpenCount: sessions.filter(
      (s) => s.status === 'scheduled' && isOpenSessionFromTodayForwardEastern(s.scheduled_datetime)
    ).length,
    upcomingKidsSignedUpCount: sessionsRows.reduce((sum, s) => {
      if (s.status !== 'scheduled' || !isOpenSessionFromTodayForwardEastern(s.scheduled_datetime))
        return sum;
      return sum + youthParticipantSignupCount(s);
    }, 0),
  };

  // Build coach list from all athletes so coaches with no sessions (e.g. Cam) still appear
  const athletesRows = (athletesRes.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    school: string | null;
    average_rating?: number | null;
    review_count?: number | null;
    active?: boolean | null;
  }>;
  const athleteMap = new Map<string, AthleteReport>();
  for (const o of athletesRows) {
    const agg = reviewAggByAthlete.get(o.id);
    const fromReviews =
      agg && agg.count > 0
        ? {
            average_rating: roundRatingAvg(agg.sum, agg.count),
            review_count: agg.count,
          }
        : null;
    athleteMap.set(o.id, {
      athlete_id: o.id,
      athlete_name: `${o.first_name} ${o.last_name}`.trim() || '—',
      school: o.school ?? '',
      session_count: 0,
      total_earnings: 0,
      completed_count: 0,
      average_rating: fromReviews
        ? fromReviews.average_rating
        : o.average_rating != null
          ? Number(o.average_rating)
          : null,
      review_count: fromReviews
        ? fromReviews.review_count
        : o.review_count != null
          ? Number(o.review_count)
          : 0,
      active: o.active ?? false,
    });
  }
  for (const s of sessionsRows) {
    const a = s.athletes;
    const o = Array.isArray(a) ? a[0] : a;
    if (!o?.id) continue;
    const r = athleteMap.get(o.id);
    if (r) {
      r.session_count += 1;
      const paidSum = participantAmountPaidSum(s);
      r.total_earnings += coachPayoutUsdUnlessUnpaidPending(
        {
          status: s.status,
          athlete_payment: s.athlete_payment,
          price_per_participant: s.price_per_participant ?? 30,
          current_participants: s.current_participants ?? 0,
          participant_amount_paid_sum: paidSum,
          session_payout_rate: (s as { session_payout_rate?: number | null }).session_payout_rate ?? null,
          coach_payout_rate:
            o && (o as { payout_rate?: number | null }).payout_rate != null
              ? Number((o as { payout_rate?: number | null }).payout_rate)
              : null,
        },
        paidSum
      );
      if (s.status === 'completed') r.completed_count += 1;
    }
  }
  const athleteReports = Array.from(athleteMap.values()).sort(
    (a, b) => b.total_earnings - a.total_earnings || a.athlete_name.localeCompare(b.athlete_name)
  );

  // Coach payouts: completed sessions not yet paid (athlete_payout_date IS NULL)
  const payoutOwedByAthlete = new Map<string, { amount: number; venmo_handle?: string | null; zelle_email?: string | null; name: string; school: string }>();
  for (const s of sessionsRows) {
    if (s.status !== 'completed' || s.athlete_payout_date != null) continue;
    const a = s.athletes;
    const o = Array.isArray(a) ? a[0] : a;
    if (!o?.id) continue;
    const existing = payoutOwedByAthlete.get(o.id);
    const payment = coachPayoutUsd({
      athlete_payment: s.athlete_payment,
      price_per_participant: s.price_per_participant,
      current_participants: s.current_participants,
      participant_amount_paid_sum: participantAmountPaidSum(s),
      session_payout_rate: (s as { session_payout_rate?: number | null }).session_payout_rate ?? null,
      coach_payout_rate:
        o && (o as { payout_rate?: number | null }).payout_rate != null
          ? Number((o as { payout_rate?: number | null }).payout_rate)
          : null,
    });
    if (existing) {
      existing.amount += payment;
    } else {
      payoutOwedByAthlete.set(o.id, {
        amount: payment,
        venmo_handle: o.venmo_handle ?? null,
        zelle_email: o.zelle_email ?? null,
        name: `${o.first_name} ${o.last_name}`,
        school: o.school ?? '',
      });
    }
  }
  const coachPayouts = Array.from(payoutOwedByAthlete.entries())
    .map(([athlete_id, data]) => ({ athlete_id, ...data }))
    .sort((a, b) => b.amount - a.amount);

  // Credits with parent email
  const credits: CreditRecord[] = (creditsRes.data ?? []).map((c) => ({
    id: c.id,
    parent_id: c.parent_id,
    parent_email: emailByUserId.get(c.parent_id) ?? '—',
    amount: Number(c.amount),
    remaining: Number(c.remaining),
    source: c.source,
    description: c.description,
    created_at: c.created_at,
    expires_at: c.expires_at,
  }));

  const recruitNcRowsRaw = (creditsRes.data ?? []).filter((c) =>
    isRecruitNcCreditRow({
      source: typeof (c as { source?: unknown }).source === 'string' ? (c as { source: string }).source : null,
      description:
        typeof (c as { description?: unknown }).description === 'string'
          ? (c as { description: string }).description
          : null,
    })
  );

  let recruitNcSpendUsd = 0;
  const recruitNcIds = recruitNcRowsRaw.map((c) => (c as { id: string }).id);
  if (recruitNcIds.length > 0) {
    const { data: usageRows } = await admin.from('credit_usage').select('amount').in('credit_id', recruitNcIds);
    recruitNcSpendUsd = (usageRows ?? []).reduce((s, r) => {
      const amt = typeof (r as { amount?: unknown }).amount === 'number' ? (r as { amount: number }).amount : 0;
      return s + amt;
    }, 0);
  }

  const recruitNcRollup = rollupRecruitNcGrantRowsUsd(
    recruitNcRowsRaw.map((c) => ({
      amount: (c as { amount?: unknown }).amount,
      remaining: (c as { remaining?: unknown }).remaining,
    }))
  );
  const recruitNcCreditTotals: RecruitNcCreditTotals = {
    ...recruitNcRollup,
    spentAtCheckoutUsd: Math.round(recruitNcSpendUsd * 100) / 100,
  };

  const coachNameByUserId = new Map(
    athletesRows.map((a) => [a.id, `${a.first_name} ${a.last_name}`.trim()])
  );

  const kidsLinesByParentId = new Map<string, string>();
  {
    const byParent = new Map<string, string[]>();
    for (const row of (allYouthNamesRes.data ?? []) as Array<{
      parent_id: string;
      first_name: string;
      last_name: string;
    }>) {
      const label = `${row.first_name} ${row.last_name}`.trim();
      if (!label) continue;
      const arr = byParent.get(row.parent_id) ?? [];
      arr.push(label);
      byParent.set(row.parent_id, arr);
    }
    for (const [pid, names] of byParent) {
      kidsLinesByParentId.set(pid, names.join(', '));
    }
  }

  function displayNameFromUser(u: {
    email: string;
    first_name?: string | null;
    last_name?: string | null;
  }): string {
    const n = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    return n || u.email;
  }

  function parentRowName(u: (typeof usersRows)[0]): { name: string; kids_summary: string | null } {
    const fromUser = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    const kids = kidsLinesByParentId.get(u.id) ?? '';
    let name: string;
    if (fromUser) {
      name = fromUser;
    } else if (kids) {
      name = `Parent · ${kids}`;
    } else {
      name = u.email;
    }
    const kids_summary = fromUser && kids ? kids : null;
    return { name, kids_summary };
  }

  function parentDisplayForWrestlerRow(
    parentUser: (typeof usersRows)[0] | undefined,
    parentId: string
  ): string {
    if (!parentUser) return emailByUserId.get(parentId) ?? '—';
    if (parentUser.role === 'parent') {
      return parentRowName(parentUser).name;
    }
    return displayNameFromUser(parentUser);
  }

  const fromAccounts: RecentSignupRow[] = usersRows
    .filter((u) => u.role === 'parent' || u.role === 'coach')
    .slice(0, 45)
    .map((u) => {
      if (u.role === 'coach') {
        const name = coachNameByUserId.get(u.id) || displayNameFromUser(u);
        return {
          kind: 'coach' as const,
          id: u.id,
          name,
          email: u.email,
          created_at: u.created_at,
        };
      }
      const { name, kids_summary } = parentRowName(u);
      return {
        kind: 'parent' as const,
        id: u.id,
        name,
        email: u.email,
        created_at: u.created_at,
        kids_summary,
      };
    });

  const ywRows = (youthWrestlersRes.data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    parent_id: string;
    created_at: string;
  }>;

  const fromWrestlers: RecentSignupRow[] = ywRows.slice(0, 45).map((y) => {
    const parentUser = usersRows.find((x) => x.id === y.parent_id);
    const parent_email = parentUser?.email ?? emailByUserId.get(y.parent_id) ?? '—';
    const parent_name = parentDisplayForWrestlerRow(parentUser, y.parent_id);
    return {
      kind: 'youth_wrestler' as const,
      id: y.id,
      name: `${y.first_name} ${y.last_name}`.trim(),
      parent_name,
      parent_email,
      created_at: y.created_at,
    };
  });

  const recentSignups: RecentSignupRow[] = [...fromAccounts, ...fromWrestlers]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 36);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-serif text-foreground">Admin</h1>
        <p className="text-muted-foreground mt-1">
          Cockpit · Sessions · Users · Billing · Payouts · Coaches
        </p>
      </div>
      <AdminDashboardClient
        sessions={sessions}
        users={users}
        billing={billing}
        athleteReports={athleteReports}
        coachPayouts={coachPayouts}
        credits={credits}
        recruitNcCreditTotals={recruitNcCreditTotals}
        usersError={usersRes.error?.message ?? null}
        youthSessionSpendLines={youthSessionSpendLines}
        recentSignups={recentSignups}
        rewardsProgramEnabled={isRewardsProgramEnabled()}
      />
    </div>
  );
}
