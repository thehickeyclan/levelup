'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import {
  sessionConfirmedRegistrantNames,
  sessionHasConfirmedRegistrants,
} from '@/lib/coach-session-registrants';
import type { CoachSession } from '@/app/(athlete)/athlete-dashboard/coach-schedule-card';

function facilityLabel(s: CoachSession): string {
  const f = s.facilities;
  if (!f || typeof f !== 'object') return '—';
  const arr = Array.isArray(f) ? f : [f];
  return (arr[0] as { name?: string })?.name ?? '—';
}

type Props = {
  sessions: CoachSession[];
  completingSessionId: string | null;
  cancellingSessionId: string | null;
  onMarkComplete: (sessionId: string) => void;
  onCancelEmpty: (sessionId: string) => void;
};

export function CoachSessionsNeedCompletePanel({
  sessions,
  completingSessionId,
  cancellingSessionId,
  onMarkComplete,
  onCancelEmpty,
}: Props) {
  if (sessions.length === 0) return null;

  const withRegistrants = sessions.filter(sessionHasConfirmedRegistrants).length;
  const emptyCount = sessions.length - withRegistrants;

  const intro =
    withRegistrants > 0 && emptyCount > 0
      ? 'Mark sessions with athletes complete, or remove empty slots that never filled.'
      : emptyCount > 0
        ? 'These slots never filled. Remove them to clear your schedule.'
        : 'Mark them done so families see activity and your payout moves forward.';

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Close out ({sessions.length})
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
        </div>
        <div className="space-y-2">
          {sessions.map((session) => {
            const dt = new Date(session.scheduled_datetime);
            const typeLabel = getSessionTypeDisplay(session.session_type, session.session_mode).label;
            const hasRegistrants = sessionHasConfirmedRegistrants(session);
            const names = sessionConfirmedRegistrantNames(session);
            const isCompleting = completingSessionId === session.id;
            const isCancelling = cancellingSessionId === session.id;
            const isBusy = isCompleting || isCancelling;

            return (
              <div
                key={session.id}
                className="rounded-lg border border-border/80 bg-card px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {formatEST(dt, 'EEE, MMM d')} · {formatEST(dt, 'h:mm a')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {typeLabel} · {facilityLabel(session)}
                  </p>
                  {hasRegistrants ? (
                    <p className="text-sm text-foreground/90 mt-1 truncate">{names.join(', ')}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">Nobody registered</p>
                  )}
                </div>
                {hasRegistrants ? (
                  <Button
                    type="button"
                    className="shrink-0 min-h-[44px] bg-accent hover:bg-accent-hover text-black font-semibold"
                    disabled={isBusy}
                    onClick={() => onMarkComplete(session.id)}
                  >
                    {isCompleting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                        Marking…
                      </>
                    ) : (
                      'Mark complete'
                    )}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 min-h-[44px] text-destructive border-destructive/40 hover:bg-destructive/10"
                    disabled={isBusy}
                    onClick={() => onCancelEmpty(session.id)}
                  >
                    {isCancelling ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                        Removing…
                      </>
                    ) : (
                      'Remove'
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
