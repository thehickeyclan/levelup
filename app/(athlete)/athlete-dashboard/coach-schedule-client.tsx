'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CoachScheduleWelcomeBanner } from '@/components/coach-schedule-welcome-banner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarPlus, Check, Loader2, X } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import type { CoachSession } from './coach-schedule-card';
import { splitCoachSessionsByToday } from '@/lib/coach-schedule-split';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import { CoachScheduleSessionCard } from './coach-schedule-session-card';

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

type Props = {
  upcomingSessions: CoachSession[];
  upcomingSessionsCount: number;
  pendingJoinRequests: JoinRequestItem[];
  coachFirstName?: string | null;
  coachDisplayName: string;
  calendarLastUpdatedAt?: string | null;
};

function sessionTypeLabel(sessionType?: string | null, sessionMode?: string | null): string {
  return getSessionTypeDisplay(sessionType, sessionMode).label;
}

export function CoachScheduleClient({
  upcomingSessions,
  upcomingSessionsCount,
  pendingJoinRequests,
  coachFirstName,
  coachDisplayName,
  calendarLastUpdatedAt,
}: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const now = new Date();
  const { today, upcoming } = splitCoachSessionsByToday(upcomingSessions, now);

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

  const showPending = pendingJoinRequests.length > 0;

  return (
    <div className="space-y-6">
      <CoachScheduleWelcomeBanner
        coachFirstName={coachFirstName}
        calendarLastUpdatedAt={calendarLastUpdatedAt}
      />

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
                coachDisplayName={coachDisplayName}
                emphasis="today"
              />
            ))}
          </div>
        </section>
      )}

      {showPending && (
        <section className="space-y-3" aria-label="Pending approval">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Pending approval ({pendingJoinRequests.length})
          </h2>
          <div className="space-y-3">
            {pendingJoinRequests.map((r) => {
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
                        {loadingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
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
            })}
          </div>
        </section>
      )}

      <section className="space-y-3 scroll-mt-4" aria-label="Upcoming sessions">
        <h2 className="text-lg font-semibold text-foreground">Upcoming</h2>
        {upcoming.length === 0 && today.length === 0 && upcomingSessions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center space-y-4">
              <p className="text-muted-foreground font-medium">No upcoming sessions.</p>
              <p className="text-sm text-muted-foreground">Create one now so parents can book or use your share link.</p>
              <Button asChild className="min-h-[44px] touch-manipulation bg-[#D4AF37] hover:bg-[#c9a432] text-black">
                <Link href="/coach-sessions/create">
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Create session
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                <Link href="/availability" className="text-accent font-medium underline">
                  Set availability
                </Link>{' '}
                for calendar bookings ·{' '}
                <Link href="/coach-sessions" className="text-accent font-medium underline">
                  All sessions
                </Link>
              </p>
            </CardContent>
          </Card>
        ) : upcoming.length === 0 && today.length > 0 ? (
          <p className="text-sm text-muted-foreground">No later sessions — everything for today is above.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((session) => (
              <CoachScheduleSessionCard
                key={session.id}
                session={session}
                coachDisplayName={coachDisplayName}
              />
            ))}
          </div>
        )}
        {upcomingSessionsCount > upcomingSessions.length && (
          <Link href="/coach-sessions" className="block text-sm text-accent font-medium">
            View all {upcomingSessionsCount} upcoming sessions →
          </Link>
        )}
      </section>
    </div>
  );
}
