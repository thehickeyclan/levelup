'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatEST } from '@/lib/format-date';
import { sessionParticipantDisplayNames } from '@/lib/session-participant-display-name';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
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
  onMarkComplete: (sessionId: string) => void;
};

export function CoachSessionsNeedCompletePanel({
  sessions,
  completingSessionId,
  onMarkComplete,
}: Props) {
  if (sessions.length === 0) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Mark complete ({sessions.length})
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            These sessions already happened. Mark them done so families see activity and your payout
            moves forward.
          </p>
        </div>
        <div className="space-y-2">
          {sessions.map((session) => {
            const dt = new Date(session.scheduled_datetime);
            const typeLabel = getSessionTypeDisplay(session.session_type, session.session_mode).label;
            const names = sessionParticipantDisplayNames(session.session_participants);
            const isLoading = completingSessionId === session.id;
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
                  {names.length > 0 ? (
                    <p className="text-sm text-foreground/90 mt-1 truncate">{names.join(', ')}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  className="shrink-0 min-h-[44px] bg-accent hover:bg-accent-hover text-black font-semibold"
                  disabled={isLoading}
                  onClick={() => onMarkComplete(session.id)}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
                      Marking…
                    </>
                  ) : (
                    'Mark complete'
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
