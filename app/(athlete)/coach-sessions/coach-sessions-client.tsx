'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, DollarSign, Smartphone, Trash2, Loader2, ExternalLink, CalendarPlus, Pencil, CalendarClock } from 'lucide-react';
import { CoachSessionLinkActions } from '@/components/coach-session-link-actions';
import { CoachTextGroupDialog } from '@/components/coach-text-group-dialog';
import { SessionPhonesCopyButtons } from '@/components/session-phones-copy-buttons';
import { formatEST } from '@/lib/format-date';
import { coachPayoutUsd } from '@/lib/coach-session-payout';
import { COACH_REVENUE_FRACTION } from '@/lib/pricing';
import { showSessionSmsCopyAndTextGroup } from '@/lib/session-sms-tools';
import { sessionParticipantDisplayNames } from '@/lib/session-participant-display-name';
import { AddToCalendarButton } from '@/components/add-to-calendar-button';
import { SessionTypeBadge } from '@/components/session-type-badge';
import { CapacityBadge } from '@/components/capacity-badge';
import { SessionContactsPanel } from '@/components/session-contacts-panel';
import type { CoachSession } from '@/app/(athlete)/athlete-dashboard/coach-schedule-card';

function facilityName(s: CoachSession): string {
  const f = s.facilities;
  if (!f || typeof f !== 'object') return '—';
  const arr = Array.isArray(f) ? f : [f];
  const first = arr[0] as { name?: string } | null;
  return first?.name ?? '—';
}

function participantPaidSum(s: CoachSession): number {
  const parts = s.session_participants;
  if (!Array.isArray(parts)) return 0;
  return parts.reduce(
    (sum, p) => sum + Number((p as { amount_paid?: number | null }).amount_paid ?? 0),
    0
  );
}

function wrestlerNames(s: CoachSession): string[] {
  return sessionParticipantDisplayNames(s.session_participants);
}

function registeredCount(s: CoachSession): number {
  const names = wrestlerNames(s);
  const rows = Array.isArray(s.session_participants) ? s.session_participants.length : 0;
  return Math.max(s.current_participants ?? 0, rows, names.length);
}

type Tab = 'mine' | 'requests' | 'completed' | 'all';

type RequestItem = {
  id: string;
  session_id: string;
  message?: string;
  status: string;
  created_at: string;
  youth_wrestler_id: string;
  youth_wrestlers?: { id: string; first_name?: string; last_name?: string; age?: number; weight_class?: string; skill_level?: string } | null;
  session?: { id: string; scheduled_datetime: string; session_type?: string; session_mode?: string; facilities?: { name?: string } | null };
};

export type CommunitySession = {
  id: string;
  scheduled_datetime: string;
  session_type?: string | null;
  session_mode?: string | null;
  current_participants?: number | null;
  max_participants?: number | null;
  price_per_participant?: number | null;
  athletes?:
    | { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string | null }
    | Array<{ id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string | null }>
    | null;
  facilities?:
    | { id?: string; name?: string }
    | Array<{ id?: string; name?: string }>
    | null;
};

function communityFacilityName(s: CommunitySession): string {
  const f = s.facilities;
  if (!f || typeof f !== 'object') return '—';
  const arr = Array.isArray(f) ? f : [f];
  return (arr[0] as { name?: string })?.name ?? '—';
}

function communityCoachName(s: CommunitySession): string {
  const a = s.athletes;
  const o = a ? (Array.isArray(a) ? a[0] : a) : null;
  return o ? [o.first_name, o.last_name].filter(Boolean).join(' ').trim() || 'Coach' : 'Coach';
}

function communityCoachSchool(s: CommunitySession): string | null {
  const a = s.athletes;
  const o = a ? (Array.isArray(a) ? a[0] : a) : null;
  const sch = o?.school;
  return sch && String(sch).trim() ? String(sch).trim() : null;
}

type Props = {
  initialTab: Tab;
  upcomingSessions: CoachSession[];
  completedSessions: CoachSession[];
  pendingRequests: RequestItem[];
  /** Other coaches’ public / invite-only upcoming sessions */
  communitySessions: CommunitySession[];
  payoutRate?: number;
  coachDisplayName?: string;
  /** Platform-wide open sessions only (no coach tabs). */
  communityOnly?: boolean;
};

export function CoachSessionsClient({
  initialTab,
  upcomingSessions,
  completedSessions,
  pendingRequests,
  communitySessions,
  payoutRate = COACH_REVENUE_FRACTION,
  coachDisplayName = 'Coach',
  communityOnly = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>(communityOnly ? 'all' : initialTab);

  const goTab = (id: Tab) => {
    setTab(id);
    if (id === 'mine') {
      router.replace(pathname, { scroll: false });
      return;
    }
    const params = new URLSearchParams();
    if (id === 'requests') params.set('tab', 'requests');
    else if (id === 'completed') params.set('tab', 'past');
    else if (id === 'all') params.set('tab', 'all');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>(pendingRequests);
  const [textGroupSession, setTextGroupSession] = useState<CoachSession | null>(null);
  const handleCancelSession = async (sessionId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this session? All registered participants will receive a credit for their payment.'
    );
    if (!confirmed) return;

    setCancellingId(sessionId);
    try {
      let res = await fetch(`/api/sessions/${sessionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by coach' }),
      });
      let data = await res.json();
      if (res.status === 409 && data.requiresAcknowledgement) {
        if (!window.confirm(`${data.error} This can't be undone.`)) return;
        res = await fetch(`/api/sessions/${sessionId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Cancelled by coach', acknowledgeRefunds: true }),
        });
        data = await res.json();
      }
      if (!res.ok) throw new Error(data.error || 'Failed to cancel session');
      alert(data.message || 'Session cancelled');
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to cancel session');
    } finally {
      setCancellingId(null);
    }
  };

  const handleApproveDecline = async (requestId: string, sessionId: string, action: 'approve' | 'decline') => {
    setLoadingId(requestId);
    try {
      const res = await fetch(`/api/session-join-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      router.refresh();
      window.dispatchEvent(new Event('coach-pending-refresh'));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoadingId(null);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'mine', label: 'Mine' },
    { id: 'requests', label: `Requests${requests.length > 0 ? ` (${requests.length})` : ''}` },
    { id: 'completed', label: 'Past' },
    { id: 'all', label: 'All' },
  ];

  return (
    <>
      {textGroupSession && (
        <CoachTextGroupDialog
          sessionId={textGroupSession.id}
          open={!!textGroupSession}
          onOpenChange={(open) => {
            if (!open) setTextGroupSession(null);
          }}
          sessionLabel={`${formatEST(new Date(textGroupSession.scheduled_datetime), 'EEE, MMM d · h:mm a')} · ${facilityName(textGroupSession)}`}
          onSent={() => router.refresh()}
        />
      )}
      {!communityOnly && (
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-1 pb-3 mb-4 border-b border-border/90 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
          <Button
            asChild
            size="lg"
            className="w-full sm:flex-1 min-h-[48px] touch-manipulation bg-accent text-black hover:bg-accent-hover font-semibold shadow-sm"
          >
            <Link href="/coach-sessions/create">
              <CalendarPlus className="h-5 w-5 mr-2 shrink-0" />
              Create session
            </Link>
          </Button>
          <Button variant="outline" asChild size="lg" className="w-full sm:w-auto min-h-[48px] touch-manipulation shrink-0">
            <Link href="/availability">
              <CalendarClock className="h-5 w-5 mr-2 shrink-0" />
              Availability
            </Link>
          </Button>
        </div>
      </div>
      )}

      {!communityOnly && (
      <div className="flex gap-2 border-b border-border mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => goTab(t.id)}
            className={`min-h-[44px] px-4 py-2 text-sm font-medium border-b-2 shrink-0 touch-manipulation ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      )}

      {!communityOnly && tab === 'mine' && (
        <div className="space-y-3">
          {upcomingSessions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm space-y-3">
                <p>No upcoming sessions.</p>
                <p>
                  <Link href="/availability" className="text-accent font-medium underline">Set your availability</Link>
                  {' '}so parents can book, or{' '}
                  <Link href="/coach-sessions/create" className="text-accent font-medium underline">
                    create a session
                  </Link>
                  {' '}with a share link.
                </p>
              </CardContent>
            </Card>
          ) : (
            upcomingSessions.map((session) => (
              <Card key={session.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <SessionTypeBadge sessionType={session.session_type} sessionMode={session.session_mode} />
                      </div>
                      <div className="rounded-lg border border-border/80 bg-muted/25 px-3 py-2.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Athletes</p>
                        <p className="text-base font-semibold text-foreground mt-0.5">
                          {(() => {
                            const n = registeredCount(session);
                            const names = wrestlerNames(session);
                            if (n === 0 && names.length === 0) return 'No bookings yet';
                            const label = `${n} athlete${n !== 1 ? 's' : ''}`;
                            return names.length > 0 ? `${label}: ${names.join(', ')}` : label;
                          })()}
                        </p>
                        {(session.max_participants ?? 1) > 1 && (
                          <div className="mt-1.5">
                            <CapacityBadge
                              current={session.current_participants ?? 0}
                              max={session.max_participants ?? 1}
                              label="spots"
                            />
                          </div>
                        )}
                      </div>
                      <p className="font-medium">
                        {formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d')} · {formatEST(new Date(session.scheduled_datetime), 'h:mm a')}
                      </p>
                      <p className="text-sm text-muted-foreground">{facilityName(session)}</p>
                      <p className="text-sm font-medium text-accent inline-flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        You make $
                        {coachPayoutUsd({
                          athlete_payment: session.athlete_payment,
                          price_per_participant: session.price_per_participant,
                          current_participants: session.current_participants,
                          participant_amount_paid_sum: participantPaidSum(session) > 0 ? participantPaidSum(session) : null,
                          session_payout_rate: session.session_payout_rate ?? null,
                          coach_payout_rate: payoutRate,
                        }).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:items-end w-full sm:w-auto min-w-0">
                      {registeredCount(session) > 0 && (
                        <SessionPhonesCopyButtons sessionId={session.id} layout="row" className="w-full sm:justify-end" />
                      )}
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                      {showSessionSmsCopyAndTextGroup(session) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] touch-manipulation border-accent/50 text-accent"
                          onClick={() => setTextGroupSession(session)}
                        >
                          <Smartphone className="h-4 w-4 mr-1" />
                          Text group
                        </Button>
                      )}
                      <CoachSessionLinkActions
                        session={{
                          id: session.id,
                          join_policy: session.join_policy,
                          partner_invite_code: session.partner_invite_code,
                          scheduled_datetime: session.scheduled_datetime,
                          session_type: session.session_type,
                          session_mode: session.session_mode,
                        }}
                        coachDisplayName={coachDisplayName}
                        facility={facilityName(session)}
                        className="w-full sm:justify-end"
                      />
                      <AddToCalendarButton
                        sessionId={session.id}
                        title={`Session ${wrestlerNames(session).join(', ') || 'with athlete'}`}
                        start={session.scheduled_datetime}
                        location={facilityName(session)}
                        size="sm"
                        className="min-h-[44px] touch-manipulation"
                      />
                      <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation" asChild>
                        <Link href={`/sessions/${session.id}/reschedule`}>
                          <CalendarClock className="h-4 w-4 mr-1" />
                          Reschedule
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation" asChild>
                        <Link href={`/coach-sessions/${session.id}/edit`}>
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px] touch-manipulation text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleCancelSession(session.id)}
                        disabled={cancellingId === session.id}
                      >
                        {cancellingId === session.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Cancel
                          </>
                        )}
                      </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Expandable contact info */}
                  <SessionContactsPanel
                    sessionId={session.id}
                    participantCount={registeredCount(session)}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {!communityOnly && tab === 'requests' && (
        <div className="space-y-8">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Join requests</h2>
            <p className="text-xs text-muted-foreground">
              Parents asking to join an existing session you already scheduled (partner / small group).
            </p>
            {requests.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-muted-foreground text-sm">
                  No pending join requests.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
            {requests.map((r) => {
              const yw = r.youth_wrestlers;
              const name = yw ? [yw.first_name, yw.last_name].filter(Boolean).join(' ') : 'A wrestler';
              const sess = r.session;
              const sessionDate = sess?.scheduled_datetime ? formatEST(new Date(sess.scheduled_datetime), 'EEE, MMM d · h:mm a') : '—';
              const fac = sess?.facilities;
              const facName = fac
                ? (Array.isArray(fac) ? (fac[0] as { name?: string })?.name : (fac as { name?: string })?.name) ?? '—'
                : '—';
              return (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-sm text-muted-foreground">{sessionDate} · {facName}</p>
                        {r.message && <p className="text-sm text-muted-foreground mt-1">&ldquo;{r.message}&rdquo;</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="min-h-[44px] touch-manipulation"
                          onClick={() => handleApproveDecline(r.id, r.session_id, 'approve')}
                          disabled={loadingId === r.id}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] touch-manipulation text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => handleApproveDecline(r.id, r.session_id, 'decline')}
                          disabled={loadingId === r.id}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Decline
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
              </div>
            )}
          </div>
        </div>
      )}

      {!communityOnly && tab === 'completed' && (
        <div className="space-y-3">
          {completedSessions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No completed sessions yet.
              </CardContent>
            </Card>
          ) : (
            completedSessions.map((session) => (
              <Card key={session.id} className="opacity-90">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-muted-foreground">
                        {formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d')} · {formatEST(new Date(session.scheduled_datetime), 'h:mm a')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {facilityName(session)}
                        {wrestlerNames(session).length > 0 && ` · ${wrestlerNames(session).join(', ')}`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {(communityOnly || tab === 'all') && (
        <div className="space-y-3">
          {communityOnly ? (
            <p className="text-sm">
              <Link href="/athlete-dashboard" className="text-accent font-medium hover:underline">
                ← Back to my schedule
              </Link>
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {communityOnly
              ? 'Public and invite sessions from other coaches on the platform.'
              : 'Open sessions other coaches are hosting (public or invite link). Yours are on Schedule → Upcoming.'}
          </p>
          {communitySessions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No other open sessions listed right now.
              </CardContent>
            </Card>
          ) : (
            communitySessions.map((session) => (
              <Card key={session.id} className="border-border/80">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SessionTypeBadge sessionType={session.session_type} sessionMode={session.session_mode} />
                      </div>
                      <p className="font-medium text-foreground">
                        {communityCoachName(session)}
                        {communityCoachSchool(session) ? (
                          <span className="text-muted-foreground font-normal"> · {communityCoachSchool(session)}</span>
                        ) : null}
                      </p>
                      <p className="text-sm">
                        {formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d')} · {formatEST(new Date(session.scheduled_datetime), 'h:mm a')}
                      </p>
                      <p className="text-sm text-muted-foreground">{communityFacilityName(session)}</p>
                      <p className="text-sm text-muted-foreground">
                        <CapacityBadge
                          current={session.current_participants ?? 0}
                          max={session.max_participants ?? 1}
                          label="spots"
                        />
                        {session.price_per_participant != null && Number(session.price_per_participant) > 0 && (
                          <span className="ml-2">${Number(session.price_per_participant).toFixed(0)}/person</span>
                        )}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="min-h-[44px] shrink-0 touch-manipulation" asChild>
                      <Link href={`/sessions/${session.id}`} prefetch={false}>
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </>
  );
}
