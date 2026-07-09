'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CoachScheduleWelcomeBanner } from '@/components/coach-schedule-welcome-banner';
import { CoachActivationPanel } from '@/components/coach/coach-activation-panel';
import { CoachScheduleEarningsSnapshot } from '@/components/coach/coach-schedule-earnings-snapshot';
import type { CoachActivationPanelData } from '@/lib/coach-activation-server';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarPlus, Check, Loader2, X } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { sessionParticipantDisplayNames } from '@/lib/session-participant-display-name';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import type { CoachSession } from './coach-schedule-card';
import { splitCoachSessionsByToday } from '@/lib/coach-schedule-split';
import { CoachScheduleSessionCard } from './coach-schedule-session-card';
import {
  CoachShareSessionsHub,
} from '@/components/coach/coach-share-sessions-hub';

export type JoinRequestItem = {
  id: string;
  session_id: string;
  message?: string;
  status: string;
  created_at: string;
  youth_wrestler_id: string;
  youth_wrestlers?: { id: string; first_name?: string; last_name?: string } | null;
  session?: {
    id: string;
    scheduled_datetime: string;
    session_type?: string | null;
    session_mode?: string | null;
    facilities?: { name?: string } | null;
  };
};

export type ScheduleTab = 'upcoming' | 'past' | 'requests';

type Props = {
  coachId: string;
  scheduleUrl: string;
  upcomingSessions: CoachSession[];
  pastSessions: CoachSession[];
  pendingJoinRequests: JoinRequestItem[];
  coachFirstName?: string | null;
  coachDisplayName: string;
  coachSchool?: string | null;
  calendarLastUpdatedAt?: string | null;
  initialTab?: ScheduleTab;
  thisMonthEarnings?: number;
  thisMonthSessionCount?: number;
  projectedEarnings?: number;
  upcomingSessionCount?: number;
  activationPanel?: CoachActivationPanelData | null;
};

function facilityLabel(s: CoachSession): string {
  const f = s.facilities;
  if (!f || typeof f !== 'object') return '—';
  const arr = Array.isArray(f) ? f : [f];
  return (arr[0] as { name?: string })?.name ?? '—';
}

function sessionTypeLabel(sessionType?: string | null, sessionMode?: string | null): string {
  return getSessionTypeDisplay(sessionType, sessionMode).label;
}

function pastStatusLabel(status: string | undefined): string {
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'no-show') return 'No-show';
  return 'Past';
}

function CoachPastSessionRow({ session }: { session: CoachSession }) {
  const dt = new Date(session.scheduled_datetime);
  const names = sessionParticipantDisplayNames(session.session_participants);
  const n = Math.max(session.current_participants ?? 0, names.length);

  return (
    <div className="rounded-lg border border-border/80 bg-card px-3 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {formatEST(dt, 'EEE, MMM d')} · {formatEST(dt, 'h:mm a')}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {sessionTypeLabel(session.session_type, session.session_mode)} · {facilityLabel(session)}
        </p>
        {names.length > 0 ? (
          <p className="text-sm text-foreground/90 mt-1.5 truncate">{names.join(', ')}</p>
        ) : n > 0 ? (
          <p className="text-sm text-muted-foreground mt-1.5">{n} athletes</p>
        ) : null}
      </div>
      <Badge variant="secondary" className="shrink-0 text-xs">
        {pastStatusLabel(session.status)}
      </Badge>
    </div>
  );
}

export function CoachScheduleClient({
  coachId,
  scheduleUrl,
  upcomingSessions,
  pastSessions,
  pendingJoinRequests,
  coachFirstName,
  coachDisplayName,
  coachSchool,
  calendarLastUpdatedAt,
  initialTab = 'upcoming',
  thisMonthEarnings = 0,
  thisMonthSessionCount = 0,
  projectedEarnings = 0,
  upcomingSessionCount = 0,
  activationPanel = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ScheduleTab>(initialTab);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const now = new Date();
  const { today, upcoming } = splitCoachSessionsByToday(upcomingSessions, now);
  const pendingCount = pendingJoinRequests.length;

  const shareSessionCount = upcomingSessions.length;

  const goTab = (id: ScheduleTab) => {
    setTab(id);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (id === 'upcoming') params.delete('tab');
    else params.set('tab', id);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
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
      router.refresh();
      window.dispatchEvent(new Event('coach-pending-refresh'));
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <CoachScheduleWelcomeBanner
        coachFirstName={coachFirstName}
        calendarLastUpdatedAt={calendarLastUpdatedAt}
      />

      {activationPanel ? <CoachActivationPanel {...activationPanel} /> : null}

      <CoachScheduleEarningsSnapshot
        thisMonthEarnings={thisMonthEarnings}
        thisMonthSessionCount={thisMonthSessionCount}
        projectedEarnings={projectedEarnings}
        upcomingSessionCount={upcomingSessionCount}
      />

      <CoachShareSessionsHub
        coachId={coachId}
        coachDisplayName={coachDisplayName}
        coachSchool={coachSchool}
        scheduleUrl={scheduleUrl}
        hasUpcomingSessions={shareSessionCount > 0}
      />

      <Tabs value={tab} onValueChange={(v) => goTab(v as ScheduleTab)} className="w-full">
        <TabsList className="w-full grid grid-cols-3 h-10 p-0.5 rounded-lg bg-zinc-900/60 border border-border/60">
          <TabsTrigger
            value="upcoming"
            className="min-h-[36px] touch-manipulation text-sm rounded-md data-[state=active]:bg-accent/15 data-[state=active]:text-accent data-[state=active]:shadow-none"
          >
            Upcoming
          </TabsTrigger>
          <TabsTrigger
            value="past"
            className="min-h-[36px] touch-manipulation text-sm rounded-md data-[state=active]:bg-accent/15 data-[state=active]:text-accent data-[state=active]:shadow-none"
          >
            Past
          </TabsTrigger>
          <TabsTrigger
            value="requests"
            className="min-h-[36px] touch-manipulation text-sm rounded-md data-[state=active]:bg-accent/15 data-[state=active]:text-accent data-[state=active]:shadow-none relative"
          >
            Requests
            {pendingCount > 0 ? (
              <span className="ml-1 inline-flex min-w-[16px] h-4 px-1 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-black">
                {pendingCount > 99 ? '99+' : pendingCount}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-3 space-y-4">
          {today.length > 0 && (
            <section className="space-y-3" aria-label="Today">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Today — {formatEST(now, 'EEEE, MMM d')}
              </h2>
              <div className="space-y-3">
                {today.map((session) => (
                  <CoachScheduleSessionCard
                    key={session.id}
                    session={session}
                    coachId={coachId}
                    coachDisplayName={coachDisplayName}
                    coachSchool={coachSchool}
                    emphasis="today"
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3" aria-label="Upcoming sessions">
            {upcoming.length === 0 && today.length === 0 && upcomingSessions.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center space-y-4">
                  <p className="text-muted-foreground font-medium">No upcoming sessions.</p>
                  <p className="text-sm text-muted-foreground">
                    Create one now so parents can book or use your share link.
                  </p>
                  <Button asChild className="min-h-[44px] touch-manipulation bg-accent hover:bg-accent-hover text-black">
                    <Link href="/coach-sessions/create">
                      <CalendarPlus className="h-4 w-4 mr-2" />
                      Schedule new session
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : upcoming.length === 0 && today.length > 0 ? (
              <p className="text-sm text-muted-foreground">No later sessions — everything for today is above.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.length > 0 && today.length > 0 ? (
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Later
                  </h2>
                ) : null}
                {upcoming.map((session) => (
                  <CoachScheduleSessionCard
                    key={session.id}
                    session={session}
                    coachId={coachId}
                    coachDisplayName={coachDisplayName}
                    coachSchool={coachSchool}
                  />
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="past" className="mt-4 space-y-3">
          {pastSessions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No past sessions yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {pastSessions.map((session) => (
                <CoachPastSessionRow key={session.id} session={session} />
              ))}
            </div>
          )}
          <p className="text-center pt-2">
            <Link
              href="/coach-sessions?tab=all"
              className="text-sm text-accent font-medium hover:underline"
            >
              Browse all open sessions on the platform →
            </Link>
          </p>
        </TabsContent>

        <TabsContent value="requests" className="mt-4 space-y-3">
          {pendingCount === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No pending join requests.
              </CardContent>
            </Card>
          ) : (
            pendingJoinRequests.map((r) => {
              const yw = r.youth_wrestlers;
              const name = yw ? [yw.first_name, yw.last_name].filter(Boolean).join(' ').trim() : 'Athlete';
              const sess = r.session;
              const when = sess?.scheduled_datetime
                ? `${formatEST(new Date(sess.scheduled_datetime), 'EEE MMM d')} · ${formatEST(new Date(sess.scheduled_datetime), 'h:mm a')}`
                : '—';
              const fac = sess?.facilities;
              const facName = fac ? (fac as { name?: string }).name ?? '—' : '—';
              const typeLabel = sessionTypeLabel(sess?.session_type, sess?.session_mode);
              return (
                <Card key={r.id} className="border-amber-500/40 bg-amber-500/5">
                  <CardContent className="p-4 space-y-3">
                    <p className="font-medium text-foreground">{name} wants to join</p>
                    <p className="text-sm text-muted-foreground">
                      {when} · {typeLabel} · {facName}
                    </p>
                    {r.message ? (
                      <p className="text-sm text-muted-foreground">&ldquo;{r.message}&rdquo;</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="min-h-[44px] touch-manipulation"
                        onClick={() => handleApproveDecline(r.id, r.session_id, 'approve')}
                        disabled={loadingId === r.id}
                      >
                        {loadingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] touch-manipulation text-destructive border-destructive"
                        onClick={() => handleApproveDecline(r.id, r.session_id, 'decline')}
                        disabled={loadingId === r.id}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Decline
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
