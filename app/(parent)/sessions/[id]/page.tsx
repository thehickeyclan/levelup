import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SessionTypeBadge } from '@/components/session-type-badge';
import { ProfileImage } from '@/components/profile-image';
import { StarRating } from '@/components/star-rating';
import { SchoolLogo } from '@/components/school-logo';
import { formatEST } from '@/lib/format-date';
import { getEffectiveFilledCountWithListedNames } from '@/lib/sessions';
import { fetchCoachReviewStatsMap, mergeCoachReviewStatsIntoAthlete } from '@/lib/coach-review-stats';

/** Roster + badge must match DB; avoid cached 4/6 when SQL shows 5 kids. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { SessionDetailActions } from './session-detail-actions';
import { CapacityBadge } from '@/components/capacity-badge';
import { SessionRosterList } from '@/components/session-roster-badges';
import {
  buildSessionRosterParticipant,
  type SessionRosterParticipant,
} from '@/lib/wrestler-roster-display';
import { Calendar, User, MapPin, Users } from 'lucide-react';

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const { id: sessionId } = await params;
  const { invite: inviteToken } = await searchParams;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) notFound();

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Preserve invite token through auth flow
    const returnUrl = inviteToken 
      ? `/sessions/${sessionId}?invite=${inviteToken}`
      : `/sessions/${sessionId}`;
    redirect('/login?redirect=' + encodeURIComponent(returnUrl));
  }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = userData?.role;
  if (
    role !== 'parent' &&
    role !== 'admin' &&
    role !== 'coach' &&
    role !== 'youth_wrestler'
  ) {
    redirect('/dashboard');
  }

  const sessionSelect = `
    id,
    parent_id,
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
    join_policy,
    invite_token,
    duration_minutes,
    athletes(id, first_name, last_name, school, photo_url, average_rating, review_count),
    facilities(id, name, address),
    session_participants(youth_wrestler_id, amount_paid, roster_first_name, roster_last_name, youth_wrestlers(id, first_name, last_name, age, weight_class, skill_level, graduation_year))
  `;

  const youthWrestlerIds = await getParentYouthWrestlerIds(supabase, user.id);

  let session: Record<string, unknown> | null = null;
  let adminErr: string | null = null;
  let fallbackCount = 0;
  try {
    const admin = createAdminClient(tenant.slug);
    const res = await admin.from('sessions').select(sessionSelect).eq('id', sessionId).single();
    if (!res.error && res.data) session = res.data;
    else if (res.error) adminErr = res.error.message || res.error.code || String(res.error);
  } catch (e) {
    adminErr = e instanceof Error ? e.message : String(e);
  }
  if (!session) {
    let familySessionIds: string[] = [];
    if (youthWrestlerIds.length > 0) {
      const { data: partRows } = await supabase
        .from('session_participants')
        .select('session_id')
        .in('youth_wrestler_id', youthWrestlerIds);
      familySessionIds = [...new Set((partRows ?? []).map((r: { session_id: string }) => r.session_id))];
    }
    const idsToFetch = [...new Set([...familySessionIds, sessionId])];
    const { data: sessionsList } = await supabase
      .from('sessions')
      .select(sessionSelect)
      .in('id', idsToFetch);
    fallbackCount = sessionsList?.length ?? 0;
    session = sessionsList?.find((row) => (row as { id: string }).id === sessionId) ?? null;
  }
  if (!session) {
    console.error('[sessions/[id]] 404', { sessionId, userId: user.id, adminErr, youthCount: youthWrestlerIds.length, fallbackRows: fallbackCount });
    notFound();
  }

  const s = session as {
    parent_id?: string;
    athlete_id?: string;
    scheduled_datetime?: string;
    status?: string;
    total_price?: number;
    price_per_participant?: number | null;
    session_type?: string;
    session_mode?: string;
    focus_area?: string | null;
    focus_area_2?: string | null;
    current_participants?: number;
    max_participants?: number;
    join_policy?: string | null;
    invite_token?: string | null;
    duration_minutes?: number | null;
    athletes?: { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string | null; average_rating?: number | null; review_count?: number | null; phone?: string | null } | { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string | null; average_rating?: number | null; review_count?: number | null; phone?: string | null }[];
    facilities?: { id: string; name?: string; address?: string | null } | { id: string; name?: string; address?: string | null }[];
    session_participants?: Array<{
      youth_wrestler_id?: string;
      amount_paid?: number | null;
      youth_wrestlers?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
    }>;
  };

  const isAdmin = role === 'admin';
  const isOwner = s.parent_id === user.id;
  const isCoach = s.athlete_id === user.id;
  const participantYouthIds = (s.session_participants ?? [])
    .map((p) => p.youth_wrestler_id)
    .filter(Boolean) as string[];
  const isParticipant = youthWrestlerIds.some((id) => participantYouthIds.includes(id));

  // Allow view if session exists and user has a valid role (link = permission; no extra gate so View never 404s)

  const scheduledTime = s.scheduled_datetime ? new Date(s.scheduled_datetime) : null;
  const now = new Date();
  const isPast =
    s.status === 'completed' ||
    s.status === 'cancelled' ||
    s.status === 'no-show' ||
    (scheduledTime != null && scheduledTime < now);

  const canCancel =
    !isPast &&
    s.status === 'scheduled' &&
    scheduledTime != null &&
    scheduledTime > now &&
    isOwner;
  const canLeave = canCancel && !isOwner;
  const max = s.max_participants ?? 1;

  const rosterParticipants = (s.session_participants ?? [])
    .map((p) => {
      const ywRaw = p.youth_wrestlers;
      const yw = Array.isArray(ywRaw) ? ywRaw[0] : ywRaw;
      const pRow = p as { roster_first_name?: string | null; roster_last_name?: string | null };
      return buildSessionRosterParticipant(
        yw
          ? {
              first_name: yw.first_name,
              last_name: yw.last_name,
              age: (yw as { age?: number }).age,
              weight_class: (yw as { weight_class?: string }).weight_class,
              skill_level: (yw as { skill_level?: string }).skill_level,
              graduation_year: (yw as { graduation_year?: number }).graduation_year,
            }
          : {
              first_name: pRow.roster_first_name,
              last_name: pRow.roster_last_name,
            }
      );
    })
    .filter((r): r is SessionRosterParticipant => r != null);

  const participantsList = rosterParticipants.map((r) => r.name);

  /** Badge must match visible roster; sessions.current_participants often lags after manual SQL. */
  const current = getEffectiveFilledCountWithListedNames(
    {
      current_participants: s.current_participants,
      max_participants: s.max_participants,
      session_participants: s.session_participants ?? [],
    },
    participantsList.length
  );
  const openings = Math.max(0, max - current);
  const joinPolicy = s.join_policy ?? 'private';
  
  // For invite-only sessions, check if user has access via:
  // 1. Valid invite token in URL
  // 2. Existing session_invite_access record
  let hasInviteAccess = false;
  if (joinPolicy === 'invite_only' && !isOwner && !isParticipant) {
    // Check if URL invite token matches session's invite_token
    if (inviteToken && s.invite_token && inviteToken === s.invite_token) {
      hasInviteAccess = true;
      // Store access record for future visits (fire and forget)
      try {
        const admin = createAdminClient(tenant.slug);
        await admin.from('session_invite_access').upsert({
          user_id: user.id,
          session_id: sessionId,
          accessed_at: new Date().toISOString(),
        }, { onConflict: 'user_id,session_id' });
      } catch {
        // Ignore errors - table may not exist yet
      }
    } else {
      // Check for existing access record
      try {
        const admin = createAdminClient(tenant.slug);
        const { data: accessRecord } = await admin
          .from('session_invite_access')
          .select('id')
          .eq('user_id', user.id)
          .eq('session_id', sessionId)
          .maybeSingle();
        hasInviteAccess = !!accessRecord;
      } catch {
        // Table may not exist - no access
      }
    }
  }
  
  const canRegister =
    !isPast &&
    s.status === 'scheduled' &&
    openings > 0 &&
    (isOwner || (!isParticipant && (joinPolicy === 'public' || (joinPolicy === 'invite_only' && hasInviteAccess))));

  const coach = Array.isArray(s.athletes) ? s.athletes[0] : s.athletes;
  const coachIdForStats =
    (coach?.id && String(coach.id).trim()) || (s.athlete_id && String(s.athlete_id).trim()) || '';
  const sessionReviewStatsMap = coachIdForStats
    ? await fetchCoachReviewStatsMap(supabase, [coachIdForStats])
    : new Map();
  const coachForRating = coach
    ? mergeCoachReviewStatsIntoAthlete(
        coach as {
          id: string;
          average_rating?: number | null;
          review_count?: number | null;
        },
        sessionReviewStatsMap
      )
    : null;
  const coachName = coach
    ? `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim() || 'Coach'
    : 'Coach';
  let coachPhone: string | null = null;
  if (s.athlete_id) {
    try {
      const adminPhone = createAdminClient(tenant.slug);
      const { data: coachUser } = await adminPhone
        .from('users')
        .select('phone')
        .eq('id', s.athlete_id)
        .maybeSingle();
      coachPhone = coachUser?.phone ?? null;
    } catch {
      coachPhone = null;
    }
  }
  const coachIdForLink = (coach?.id && String(coach.id).trim()) || (s.athlete_id && String(s.athlete_id).trim()) || null;
  const fac = Array.isArray(s.facilities) ? s.facilities[0] : s.facilities;
  const facilityName = fac?.name ?? '—';
  const facilityAddress = fac?.address ?? null;

  let amountPaid = 0;
  const myParticipantIds = new Set(youthWrestlerIds);
  for (const p of s.session_participants ?? []) {
    if (!p.youth_wrestler_id || !myParticipantIds.has(p.youth_wrestler_id)) continue;
    const amt = p.amount_paid;
    if (amt != null && Number(amt) > 0) amountPaid += Number(amt);
  }

  const coachIdForReview = s.athlete_id && String(s.athlete_id).trim();
  const { data: coachReviewRows } =
    isPast && s.status === 'completed' && coachIdForReview
      ? await supabase
          .from('reviews')
          .select('id')
          .eq('parent_id', user.id)
          .eq('athlete_id', coachIdForReview)
          .limit(1)
      : { data: [] };
  const hasReviewed = (coachReviewRows ?? []).length > 0;

  const statusBadge = (status: string) => {
    if (status === 'scheduled') return <Badge>Open</Badge>;
    if (status === 'completed') return <Badge variant="default">Paid</Badge>;
    if (status === 'cancelled') return <Badge variant="secondary">Cancelled</Badge>;
    if (status === 'no-show') return <Badge variant="secondary">No-show</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-lg">
      <div className="mb-4">
        <BackLink fallbackHref="/bookings" label="Back to My bookings" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <ProfileImage
              src={coach?.photo_url ?? null}
              alt={coachName}
              className="w-14 h-14 shrink-0 rounded-full object-cover border border-border"
              fallbackIconClassName="h-7 w-7 text-muted-foreground"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="text-lg flex flex-wrap items-center gap-2">
                <SessionTypeBadge sessionType={s.session_type} sessionMode={s.session_mode} />
                {(s.focus_area || s.focus_area_2) && (
                  <Badge variant="secondary" className="font-normal text-xs">
                    {[s.focus_area, s.focus_area_2].filter(Boolean).join(', ')}
                  </Badge>
                )}
                {max > 1 && (
                  <CapacityBadge current={current} max={max} label="" />
                )}
                {s.status && statusBadge(s.status)}
              </CardTitle>
              <p className="font-semibold text-foreground">
                {scheduledTime
                  ? formatEST(scheduledTime, 'EEEE, MMM d, yyyy')
                  : '—'}
                {scheduledTime && ` · ${formatEST(scheduledTime, 'h:mm a')}`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="font-medium text-foreground">{facilityName}</span>
            </p>
            {facilityAddress && (
              <p className="pl-6 text-muted-foreground">{facilityAddress}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            {coachIdForLink ? (
              <Link
                href={`/athlete/${coachIdForLink}`}
                className="font-medium text-foreground hover:underline"
              >
                {coachName}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{coachName}</span>
            )}
            {coach?.school && (
              <span className="flex items-center gap-1">
                <SchoolLogo school={coach.school} size="sm" />
                <span className="text-muted-foreground/80">({coach.school})</span>
              </span>
            )}
            {coachIdForLink && (
              <Link href={`/athlete/${coachIdForLink}`} className="text-xs text-accent hover:underline">
                View profile
              </Link>
            )}
          </div>
          <StarRating
            averageRating={coachForRating?.average_rating ?? null}
            reviewCount={coachForRating?.review_count ?? null}
            size="sm"
          />
          {coachPhone && (
            <p className="text-sm text-muted-foreground">
              Coach: <a href={`tel:${coachPhone}`} className="text-foreground hover:underline">{coachPhone}</a>
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            {max > 1 ? (
              <CapacityBadge current={current} max={max} label="registered" />
            ) : (
              <span className="text-sm font-medium text-foreground">{current} registered</span>
            )}
            {max > 1 && (
              <span className="text-sm text-muted-foreground">
                {openings} opening{openings !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {rosterParticipants.length > 0 && (
            <div className="pl-6">
              <SessionRosterList participants={rosterParticipants} label="Athletes registered" />
            </div>
          )}

          <div className="pt-2">
            <p className="text-sm font-semibold text-foreground">
              {amountPaid > 0
                ? `You paid $${Number(amountPaid).toFixed(2)}`
                : s.total_price != null && s.total_price > 0
                  ? `$${Number(s.total_price).toFixed(2)}`
                  : s.price_per_participant != null && s.price_per_participant > 0
                    ? `$${Number(s.price_per_participant).toFixed(2)} / person`
                    : '—'}
            </p>
          </div>

          <div className="pt-2 border-t space-y-3">
            {canRegister && (
              <Link href={`/sessions/${sessionId}/register`} className="inline-flex">
                <Button className="min-h-[44px] px-4 w-full sm:w-auto bg-accent hover:bg-accent/90 text-primary">
                  Register now
                </Button>
              </Link>
            )}
            <SessionDetailActions
              sessionId={sessionId}
              isPast={isPast}
              isOwner={isOwner}
              canLeave={canLeave}
              canCancel={!!canCancel}
              scheduledDatetime={s.scheduled_datetime ?? ''}
              totalPrice={s.total_price ?? 0}
              status={s.status ?? 'scheduled'}
              hasReviewed={hasReviewed}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
