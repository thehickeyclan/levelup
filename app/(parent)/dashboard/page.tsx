import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import Link from 'next/link';
import { VIEW_AS_COOKIE_NAME } from '@/lib/auth/view-as-cookie';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { Button } from '@/components/ui/button';
import { YouthWrestler } from '@/types';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import { ensureAutoFamilyDiscountForParent } from '@/lib/family-auto-discount';
import { checkoutAllowSavedAccountPercent } from '@/lib/checkout-promo';
import { ParentHomeReviewsSection } from '@/components/parent-home-reviews-section';
import type { ReviewSessionPayload } from '@/components/parent-home-review-sheet';
import {
  ParentHomeAnnouncementBanners,
  type ParentHomeAnnouncement,
} from '@/components/parent-home-announcement-banners';
import { ParentHomeUpcomingSessionCard } from '@/components/parent-home-upcoming-session-card';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('first_name, role').eq('id', user.id).single();
  if (userData?.role === 'coach') redirect('/athlete-dashboard');

  const isAdmin = userData?.role === 'admin';
  const cookieStore = await cookies();
  const viewAsCookie = cookieStore.get(VIEW_AS_COOKIE_NAME)?.value;
  const adminPreviewAsParent = isAdmin && viewAsCookie === 'parent';

  if (isAdmin && !adminPreviewAsParent) {
    redirect('/admin');
  }

  const nowISO = new Date().toISOString();
  const admin = createAdminClient(tenant.slug);

  if (userData?.role === 'parent' && checkoutAllowSavedAccountPercent()) {
    await ensureAutoFamilyDiscountForParent(admin, user.id, user.email);
  }

  const youthWrestlerIds = await getParentYouthWrestlerIds(supabase, user.id);
  const { data: youthWrestlersRaw } = youthWrestlerIds.length > 0
    ? await supabase.from('youth_wrestlers').select('*').in('id', youthWrestlerIds).order('created_at', { ascending: false })
    : { data: [] };
  const youthWrestlers = [...new Map((youthWrestlersRaw ?? []).map((yw: YouthWrestler) => [yw.id, yw])).values()];
  const youthWrestlerIdSet = new Set(youthWrestlerIds);

  let familySessionIds: string[] = [];
  if (youthWrestlerIds.length > 0) {
    const { data: partRows } = await supabase
      .from('session_participants')
      .select('session_id')
      .in('youth_wrestler_id', youthWrestlerIds);
    familySessionIds = [...new Set((partRows ?? []).map((r: { session_id: string }) => r.session_id))];
  }

  const { data: upcomingSessions } = familySessionIds.length > 0
    ? await supabase
        .from('sessions')
        .select(`
          id,
          parent_id,
          athlete_id,
          partner_invite_code,
          join_policy,
          scheduled_datetime,
          status,
          session_type,
          session_mode,
          duration_minutes,
          athletes:athlete_id(id, first_name, last_name, phone),
          facilities:facility_id(id, name),
          session_participants(youth_wrestler_id, youth_wrestlers(first_name, last_name))
        `)
        .in('id', familySessionIds)
        .eq('status', 'scheduled')
        .gte('scheduled_datetime', nowISO)
        .order('scheduled_datetime', { ascending: true })
        .limit(100)
    : { data: [] };

  let homeAnnouncements: ParentHomeAnnouncement[] = [];
  try {
    const { data: announcementRows } = await supabase
      .from('parent_announcements')
      .select('id, announcement_type, reference_id, headline, cta_label, cta_path, expires_at')
      .gt('expires_at', nowISO)
      .order('created_at', { ascending: false })
      .limit(20);
    const { data: dismissalRows } = await supabase
      .from('parent_announcement_dismissals')
      .select('announcement_type, reference_id')
      .eq('parent_id', user.id);
    const dismissed = new Set(
      (dismissalRows ?? []).map((d) => `${d.announcement_type}:${d.reference_id}`)
    );
    const announcementFiltered = (announcementRows ?? []).filter(
      (a) =>
        !dismissed.has(`${a.announcement_type}:${a.reference_id}`) &&
        (a.announcement_type === 'new_coach' || a.announcement_type === 'new_location')
    );

    const coachRefIds = [
      ...new Set(
        announcementFiltered.filter((a) => a.announcement_type === 'new_coach').map((a) => a.reference_id)
      ),
    ];
    const facilityRefIds = [
      ...new Set(
        announcementFiltered.filter((a) => a.announcement_type === 'new_location').map((a) => a.reference_id)
      ),
    ];

    const schoolByReferenceId = new Map<string, string>();
    if (coachRefIds.length > 0) {
      const { data: coachSchoolRows } = await admin
        .from('athletes')
        .select('id, school')
        .in('id', coachRefIds);
      for (const row of coachSchoolRows ?? []) {
        const r = row as { id: string; school?: string | null };
        const s = r.school?.trim();
        if (s) schoolByReferenceId.set(r.id, s);
      }
    }
    if (facilityRefIds.length > 0) {
      const { data: facilitySchoolRows } = await admin
        .from('facilities')
        .select('id, school')
        .in('id', facilityRefIds);
      for (const row of facilitySchoolRows ?? []) {
        const r = row as { id: string; school?: string | null };
        const s = r.school?.trim();
        if (s) schoolByReferenceId.set(r.id, s);
      }
    }

    homeAnnouncements = announcementFiltered.map((a) => ({
      id: a.id,
      announcement_type: a.announcement_type as 'new_coach' | 'new_location',
      reference_id: a.reference_id,
      headline: a.headline,
      cta_label: a.cta_label ?? 'View',
      cta_path: a.cta_path,
      school: schoolByReferenceId.get(a.reference_id) ?? null,
    }));
  } catch {
    homeAnnouncements = [];
  }

  const { data: reviewIdRows } = await supabase
    .from('reviews')
    .select('session_id')
    .eq('parent_id', user.id);
  const reviewedSessionIds = new Set(
    (reviewIdRows ?? []).map((r: { session_id: string }) => r.session_id).filter(Boolean)
  );

  /** Earliest completed session per (youth_wrestler_id, coach athlete_id) — reviews only for that first session. */
  const earliestCompletedByYouthCoach = new Map<string, { id: string; scheduled_datetime: string }>();
  if (youthWrestlerIds.length > 0) {
    const { data: historyRows } = await supabase
      .from('session_participants')
      .select(
        `
        youth_wrestler_id,
        sessions!inner(id, athlete_id, status, scheduled_datetime)
      `
      )
      .in('youth_wrestler_id', youthWrestlerIds)
      .eq('sessions.status', 'completed');

    type HistoryRow = {
      youth_wrestler_id: string;
      sessions:
        | { id: string; athlete_id: string; status: string; scheduled_datetime: string }
        | { id: string; athlete_id: string; status: string; scheduled_datetime: string }[]
        | null;
    };

    for (const row of (historyRows ?? []) as HistoryRow[]) {
      const yid = row.youth_wrestler_id;
      const sessRaw = row.sessions;
      const sess = Array.isArray(sessRaw) ? sessRaw[0] : sessRaw;
      if (!sess?.athlete_id || !sess.id) continue;
      const key = `${yid}:${sess.athlete_id}`;
      const next = { id: sess.id, scheduled_datetime: sess.scheduled_datetime };
      const prev = earliestCompletedByYouthCoach.get(key);
      if (
        !prev ||
        next.scheduled_datetime < prev.scheduled_datetime ||
        (next.scheduled_datetime === prev.scheduled_datetime && next.id < prev.id)
      ) {
        earliestCompletedByYouthCoach.set(key, next);
      }
    }
  }

  const { data: completedSessions } = familySessionIds.length > 0
    ? await supabase
        .from('sessions')
        .select(`
          id,
          athlete_id,
          scheduled_datetime,
          session_type,
          session_mode,
          athletes:athlete_id(first_name, last_name),
          session_participants(youth_wrestler_id, youth_wrestlers(id, first_name, last_name))
        `)
        .in('id', familySessionIds)
        .eq('status', 'completed')
        .order('scheduled_datetime', { ascending: false })
        .limit(200)
    : { data: [] };

  type CompletedRow = {
    id: string;
    athlete_id?: string | null;
    scheduled_datetime: string;
    session_type?: string | null;
    session_mode?: string | null;
    athletes?: { first_name?: string; last_name?: string } | null;
    session_participants?: Array<{
      youth_wrestler_id?: string | null;
      youth_wrestlers?: { id?: string; first_name?: string; last_name?: string } | { id?: string; first_name?: string; last_name?: string }[] | null;
    }>;
  };

  const reviewPayloads: ReviewSessionPayload[] = [];
  for (const raw of (completedSessions ?? []) as CompletedRow[]) {
    if (reviewedSessionIds.has(raw.id)) continue;
    const parts = raw.session_participants ?? [];
    const attendingAthletes: { id: string; first_name?: string; last_name?: string }[] = [];
    for (const p of parts) {
      const ywRaw = p.youth_wrestlers;
      const yw = Array.isArray(ywRaw) ? ywRaw[0] : ywRaw;
      const yid = p.youth_wrestler_id || yw?.id;
      if (!yid || !youthWrestlerIdSet.has(yid)) continue;
      attendingAthletes.push({
        id: yid,
        first_name: yw?.first_name,
        last_name: yw?.last_name,
      });
    }
    if (attendingAthletes.length === 0) continue;
    const coachId = raw.athlete_id ?? '';
    if (!coachId) continue;
    const isFirstSessionWithCoachForSomeAthlete = attendingAthletes.some((a) => {
      const first = earliestCompletedByYouthCoach.get(`${a.id}:${coachId}`);
      return first?.id === raw.id;
    });
    if (!isFirstSessionWithCoachForSomeAthlete) continue;

    const coach = Array.isArray(raw.athletes) ? raw.athletes[0] : raw.athletes;
    reviewPayloads.push({
      id: raw.id,
      scheduled_datetime: raw.scheduled_datetime,
      session_type: raw.session_type,
      session_mode: raw.session_mode,
      athlete_id: raw.athlete_id ?? undefined,
      athletes: coach && !Array.isArray(coach) ? coach : null,
      attendingAthletes,
    });
  }

  type UpcomingRow = {
    id: string;
    parent_id?: string | null;
    athlete_id?: string | null;
    partner_invite_code?: string | null;
    join_policy?: string | null;
    scheduled_datetime: string;
    session_type?: string | null;
    session_mode?: string | null;
    duration_minutes?: number | null;
    athletes?:
      | { first_name?: string; last_name?: string; phone?: string | null }
      | { first_name?: string; last_name?: string; phone?: string | null }[]
      | null;
    facilities?: { name?: string } | null;
    session_participants?: Array<{
      youth_wrestler_id?: string | null;
      youth_wrestlers?: { first_name?: string; last_name?: string } | null;
    }>;
  };

  const firstName = userData?.first_name?.trim();
  const hasUpcoming = (upcomingSessions ?? []).length > 0;

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-xl font-bold text-foreground">Home</h1>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          {firstName
            ? `${firstName}, your upcoming sessions and reminders show up here.`
            : 'Your upcoming sessions and reminders show up here.'}{' '}
          <span className="text-zinc-500">
            Book a coach on their calendar anytime — or join open sessions when a posted spot fits.
          </span>
        </p>
      </div>

      <ParentHomeAnnouncementBanners items={homeAnnouncements} />

      <section className="px-4 mb-6" aria-label="Upcoming sessions">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Upcoming Sessions
        </h2>
        {(upcomingSessions ?? []).length > 0 ? (
          <div className="space-y-3">
            {(upcomingSessions ?? []).map((session) => {
              const s = session as UpcomingRow;
              const coach = Array.isArray(s.athletes) ? s.athletes[0] : s.athletes;
              const facility = Array.isArray(s.facilities) ? s.facilities[0] : s.facilities;
              const coachName = coach ? [coach.first_name, coach.last_name].filter(Boolean).join(' ').trim() : 'Coach';
              const coachFirstName = coach?.first_name?.trim() || 'Coach';
              const typeLabel = getSessionTypeDisplay(s.session_type ?? null, s.session_mode ?? null).label;
              const dt = new Date(s.scheduled_datetime);
              const dur = s.duration_minutes;
              const kidNames: string[] = [];
              for (const p of s.session_participants ?? []) {
                if (!p.youth_wrestler_id || !youthWrestlerIdSet.has(p.youth_wrestler_id)) continue;
                const yw = p.youth_wrestlers;
                const nm = yw ? [yw.first_name, yw.last_name].filter(Boolean).join(' ').trim() : '';
                if (nm) kidNames.push(nm);
              }
              const kidsLine =
                kidNames.length === 0
                  ? ''
                  : kidNames.length === 1
                    ? `${kidNames[0]} registered`
                    : `${kidNames.join(', ')} registered`;
              const pid = s.parent_id ?? null;
              const aid = s.athlete_id ?? null;
              const isParentInitiated = Boolean(pid && aid && pid === user.id && pid !== aid);
              const athleteFirstName = kidNames[0]?.split(/\s+/)[0] || 'your athlete';
              const whenLine = `${formatEST(dt, 'EEE, MMM d')} · ${formatEST(dt, 'h:mm a')}`;
              const detailLine = `${typeLabel}${facility?.name ? ` · ${facility.name}` : ''}${dur != null && dur > 0 ? ` · ${dur} min` : ''}`;
              const coachKidsLine = `${coachName}${kidsLine ? ` · ${kidsLine}` : ''}`;

              return (
                <ParentHomeUpcomingSessionCard
                  key={s.id}
                  sessionId={s.id}
                  whenLine={whenLine}
                  detailLine={detailLine}
                  coachKidsLine={coachKidsLine}
                  isParentInitiated={isParentInitiated}
                  partnerInviteCode={s.partner_invite_code}
                  coachPhone={coach?.phone ?? null}
                  coachFirstName={coachFirstName}
                  athleteFirstName={athleteFirstName}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-6 text-center space-y-4">
            <div className="space-y-1">
              <p className="text-zinc-300 font-medium">No upcoming sessions</p>
              <p className="text-sm text-zinc-500 max-w-md mx-auto">
                Book a coach for a private or partner session — or join an open small group. Sessions you book
                show up here.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                className="min-h-[44px] bg-[#D4AF37] hover:bg-[#c9a432] text-black font-semibold"
                asChild
              >
                <Link href="/training?tab=coaches">Book a coach</Link>
              </Button>
              <Button variant="outline" className="min-h-[44px] border-zinc-700" asChild>
                <Link href="/training?tab=sessions">Open sessions</Link>
              </Button>
            </div>
          </div>
        )}
      </section>

      <ParentHomeReviewsSection
        sessions={reviewPayloads}
        youthWrestlers={youthWrestlers.map((y) => ({
          id: y.id,
          first_name: y.first_name,
          last_name: y.last_name,
        }))}
      />

      <section className="px-4 pb-8 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            className="w-full min-h-[52px] bg-[#D4AF37] hover:bg-[#c9a432] text-black font-semibold text-base"
            asChild
          >
            <Link href="/training?tab=coaches">
              {hasUpcoming ? 'Book a coach →' : 'Book a coach →'}
            </Link>
          </Button>
          <Button
            variant="outline"
            className="w-full min-h-[52px] border-zinc-700 font-semibold text-base"
            asChild
          >
            <Link href="/training?tab=sessions">Open sessions →</Link>
          </Button>
        </div>
        <p className="text-center text-xs text-zinc-500">
          Open sessions show who&apos;s registered — age, weight, and skill badges — before you join.
        </p>
      </section>
    </div>
  );
}
