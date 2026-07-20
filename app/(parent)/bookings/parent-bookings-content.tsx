import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';
import { APP_TIMEZONE } from '@/lib/format-date';
import { fetchCoachReviewStatsMap, getCoachReviewStatsForId } from '@/lib/coach-review-stats';
import { isSessionOpenForRegistrationPayment } from '@/lib/session-payment-open';
import { BookingCard, type BookingSession } from './booking-card';
import { BookingsTabsClient } from './bookings-tabs-client';

export async function ParentBookingsContent() {
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

  if (userData?.role === 'coach') redirect('/athlete-dashboard');
  // Parent sees only their wrestlers (primary or linked). Explicit filter so parents never see other users' kids.
  const youthWrestlerIds = await getParentYouthWrestlerIds(supabase, user.id);

  let familySessionIds: string[] = [];
  if (youthWrestlerIds.length > 0) {
    const { data: partRows } = await supabase
      .from('session_participants')
      .select('session_id')
      .in('youth_wrestler_id', youthWrestlerIds);
    familySessionIds = [...new Set((partRows ?? []).map((r: { session_id: string }) => r.session_id))];
  }

  const { data: sessions, error } = familySessionIds.length > 0
    ? await supabase
        .from('sessions')
        .select(`
          id,
          athlete_id,
          scheduled_datetime,
          status,
          total_price,
          price_per_participant,
          session_type,
          session_mode,
          focus_area,
          current_participants,
          max_participants,
          partner_invite_code,
          parent_id,
          athletes(id, first_name, last_name, school, photo_url, average_rating, review_count),
          facilities(id, name, address),
          session_participants(youth_wrestler_id, amount_paid, youth_wrestlers(id, first_name, last_name))
        `)
        .in('id', familySessionIds)
        .order('scheduled_datetime', { ascending: false })
    : { data: [] };

  if (error) {
    console.error('Bookings fetch error:', error);
  }

  const all = (sessions || []) as Array<{
    id: string;
    athlete_id?: string | null;
    scheduled_datetime: string;
    status: string;
    total_price: number;
    price_per_participant?: number | null;
    parent_id?: string;
    session_type?: string;
    session_mode?: string;
    focus_area?: string | null;
    focus_area_2?: string | null;
    current_participants?: number;
    max_participants?: number;
    partner_invite_code?: string | null;
    athletes?: { id: string; first_name: string; last_name: string; school: string; photo_url?: string } | { id: string; first_name: string; last_name: string; school: string; photo_url?: string }[];
    facilities?: { id: string; name: string; address?: string } | { id: string; name: string; address?: string }[];
    session_participants?: Array<{
      youth_wrestler_id: string;
      amount_paid?: number | null;
      paid?: boolean | null;
      youth_wrestlers?: { id: string; first_name: string; last_name: string } | { id: string; first_name: string; last_name: string }[] | null;
    }>;
  }>;

  const now = new Date();
  const nowISO = now.toISOString();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndISO = weekEnd.toISOString();
  const nowET = toZonedTime(now, APP_TIMEZONE);
  const y = nowET.getFullYear();
  const m = nowET.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const monthEndETStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999`;
  const monthEndISO = fromZonedTime(monthEndETStr, APP_TIMEZONE).toISOString();

  const upcoming = all.filter(
    (s) =>
      s.status === 'scheduled' &&
      s.scheduled_datetime >= nowISO
  );
  const thisWeek = upcoming.filter((s) => s.scheduled_datetime < weekEndISO);
  const thisMonth = upcoming.filter(
    (s) => s.scheduled_datetime >= weekEndISO && s.scheduled_datetime <= monthEndISO
  );
  const later = upcoming.filter((s) => s.scheduled_datetime > monthEndISO);
  const past = all.filter(
    (s) =>
      s.status === 'completed' ||
      s.status === 'cancelled' ||
      s.status === 'no-show' ||
      s.scheduled_datetime < nowISO
  );

  const coachIdsForReviewStats = [...new Set(all.map((s) => s.athlete_id).filter(Boolean) as string[])];
  const bookingsReviewStatsMap = await fetchCoachReviewStatsMap(supabase, coachIdsForReviewStats);

  const { data: myReviewsForCoaches } = await supabase
    .from('reviews')
    .select('athlete_id')
    .eq('parent_id', user.id);
  const reviewedCoachIds = new Set(
    (myReviewsForCoaches ?? [])
      .map((r: { athlete_id?: string | null }) => r.athlete_id)
      .filter((id): id is string => Boolean(id))
  );

  const { data: dismissedReviewRows } = await supabase
    .from('review_prompt_dismissals')
    .select('athlete_id')
    .eq('parent_id', user.id);
  const dismissedReviewCoachIds = new Set(
    (dismissedReviewRows ?? [])
      .map((r: { athlete_id?: string | null }) => r.athlete_id)
      .filter((id): id is string => Boolean(id))
  );

  // All participant names per session (admin fetch so we show all kids on the card, not just current user's)
  let allParticipantsBySession: Record<string, string[]> = {};
  /** Row count per session from session_participants (source of truth when sessions.current_participants is stale). */
  const participantCountBySession: Record<string, number> = {};
  if (familySessionIds.length > 0) {
    const admin = createAdminClient(tenant.slug);
    const { data: allParts } = await admin
      .from('session_participants')
      .select('session_id, youth_wrestlers(first_name, last_name)')
      .in('session_id', familySessionIds);
    for (const p of allParts ?? []) {
      const row = p as { session_id: string; youth_wrestlers?: { first_name?: string; last_name?: string } | null };
      const sid = row.session_id;
      if (sid) {
        participantCountBySession[sid] = (participantCountBySession[sid] ?? 0) + 1;
      }
      const yw = row.youth_wrestlers;
      const name = yw ? `${yw.first_name ?? ''} ${yw.last_name ?? ''}`.trim() : null;
      if (name && row.session_id) {
        if (!allParticipantsBySession[row.session_id]) allParticipantsBySession[row.session_id] = [];
        allParticipantsBySession[row.session_id].push(name);
      }
    }
  }

  const coach = (s: (typeof all)[0]) => {
    const a = s.athletes;
    const o = a ? (Array.isArray(a) ? a[0] : a) : null;
    const fallbackId = s.athlete_id && String(s.athlete_id).trim() ? s.athlete_id : '';
    const coachId = (o?.id && String(o.id).trim()) || fallbackId;
    const rs = getCoachReviewStatsForId(bookingsReviewStatsMap, coachId);
    return {
      name: o ? `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || 'Coach' : 'Coach',
      school: o?.school ?? '',
      id: coachId,
      photo_url: (o as { photo_url?: string })?.photo_url,
      average_rating: rs.average_rating,
      review_count: rs.review_count,
    };
  };

  const facility = (s: (typeof all)[0]) => {
    const f = s.facilities;
    if (!f) return '—';
    const o = Array.isArray(f) ? f[0] : f;
    return o?.name ?? '—';
  };

  const facilityId = (s: (typeof all)[0]) => {
    const f = s.facilities;
    if (!f) return null;
    const o = Array.isArray(f) ? f[0] : f;
    return (o as { id?: string })?.id ?? null;
  };

  const primaryWrestlerId = (s: (typeof all)[0]) => {
    const parts = s.session_participants ?? [];
    const first = parts[0];
    return first ? (first as { youth_wrestler_id?: string }).youth_wrestler_id ?? null : null;
  };

  const wrestlers = (s: (typeof all)[0]) => {
    if (allParticipantsBySession[s.id]?.length) return allParticipantsBySession[s.id];
    const parts = s.session_participants ?? [];
    return parts
      .map((p) => {
        const yw = p.youth_wrestlers;
        const o = Array.isArray(yw) ? yw[0] : yw;
        return o ? `${o.first_name} ${o.last_name}` : null;
      })
      .filter(Boolean) as string[];
  };

  // Session is not "tentative" just because it's a group with open spots — once you're booked, you're confirmed
  const isTentative = (_s: (typeof all)[0]) => false;

  const familyPaymentState = (s: (typeof all)[0]) => {
    const parts = s.session_participants ?? [];
    let sum = 0;
    let needsPayment = false;
    let unpaidWrestlerId: string | null = null;
    for (const p of parts) {
      const row = p as {
        amount_paid?: number | null;
        paid?: boolean | null;
        youth_wrestler_id?: string;
      };
      const amt = row.amount_paid;
      if (amt != null && Number(amt) > 0) sum += Number(amt);
      if (row.paid === false && isSessionOpenForRegistrationPayment(s.status)) {
        needsPayment = true;
        if (!unpaidWrestlerId && row.youth_wrestler_id) unpaidWrestlerId = row.youth_wrestler_id;
      }
    }
    return { sum, needsPayment, unpaidWrestlerId };
  };

  // Transform sessions for BookingCard (include facility_id, primaryWrestlerId, isOwner for Leave vs Cancel)
  const transformSession = (s: (typeof all)[0]): BookingSession => {
    const payState = familyPaymentState(s);
    return {
    id: s.id,
    scheduled_datetime: s.scheduled_datetime,
    status: s.status,
    total_price: s.total_price,
    price_per_participant: s.price_per_participant ?? undefined,
    amountPaid: payState.sum > 0 ? payState.sum : undefined,
    needsPayment: payState.needsPayment,
    unpaidWrestlerId: payState.unpaidWrestlerId,
    session_type: s.session_type,
    session_mode: s.session_mode,
    focus_area: s.focus_area ?? null,
    focus_area_2: (s as { focus_area_2?: string | null }).focus_area_2 ?? null,
    current_participants: Math.max(
      Number(s.current_participants) || 0,
      participantCountBySession[s.id] ?? 0
    ),
    max_participants: s.max_participants ?? 1,
    partner_invite_code: s.partner_invite_code,
    isTentative: isTentative(s),
    isOwner: s.parent_id === user.id,
    coach: coach(s),
    facility: facility(s),
    facility_id: facilityId(s),
    wrestlers: wrestlers(s),
    primaryWrestlerId: primaryWrestlerId(s),
    hasReviewed: s.status === 'completed'
      ? reviewedCoachIds.has(coach(s).id) || dismissedReviewCoachIds.has(coach(s).id)
      : undefined,
    isFamilyParticipant: true,
  };
  };

  const thisWeekSessions = thisWeek.map(transformSession);
  const thisMonthSessions = thisMonth.map(transformSession);
  const laterSessions = later.map(transformSession);
  const pastSessions = past.map(transformSession);

  return (
    <div>
      <BookingsTabsClient
        thisWeek={thisWeekSessions}
        thisMonth={thisMonthSessions}
        later={laterSessions}
        closed={pastSessions}
      />
    </div>
  );
}
