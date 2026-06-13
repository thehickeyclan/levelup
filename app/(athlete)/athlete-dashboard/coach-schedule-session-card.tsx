'use client';

import { useState, useEffect } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { CoachSessionTileActions } from '@/components/coach-session-tile-actions';
import { formatEST } from '@/lib/format-date';
import { sessionParticipantDisplayNames } from '@/lib/session-participant-display-name';
import { cn } from '@/lib/utils';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import type { CoachSession } from './coach-schedule-card';

function facilityLabel(s: CoachSession): string {
  const f = s.facilities;
  if (!f || typeof f !== 'object') return '—';
  const arr = Array.isArray(f) ? f : [f];
  return (arr[0] as { name?: string })?.name ?? '—';
}

function registeredCount(s: CoachSession): number {
  const parts = s.session_participants;
  const rows = Array.isArray(parts) ? parts.length : parts ? 1 : 0;
  return Math.max(rows, s.current_participants ?? 0);
}

function participantsFromSession(s: CoachSession) {
  const parts = s.session_participants;
  if (Array.isArray(parts)) return parts;
  if (parts) return [parts];
  return [];
}

type Props = {
  session: CoachSession;
  coachDisplayName: string;
  emphasis?: 'today' | 'default';
};

export function CoachScheduleSessionCard({ session, coachDisplayName, emphasis = 'default' }: Props) {
  const dur = (session as { duration_minutes?: number }).duration_minutes ?? 60;
  const dt = new Date(session.scheduled_datetime);
  const fac = facilityLabel(session);
  const nRegistered = registeredCount(session);
  const typeLabel = getSessionTypeDisplay(session.session_type, session.session_mode).label;

  const fromJoin = sessionParticipantDisplayNames(participantsFromSession(session));
  const [fetchedNames, setFetchedNames] = useState<string[] | undefined>(undefined);
  const [rosterLoading, setRosterLoading] = useState(nRegistered > 0);

  // Authoritative roster from coach API (admin); page embed often returns partial names.
  const effectiveNames =
    fetchedNames !== undefined
      ? fetchedNames
      : fromJoin.length > 0
        ? fromJoin
        : [];

  useEffect(() => {
    if (nRegistered === 0) {
      setRosterLoading(false);
      return;
    }
    let cancelled = false;
    setRosterLoading(true);
    setFetchedNames(undefined);

    const loadRoster = async (attempt: number): Promise<string[]> => {
      const r = await fetch(`/api/coach/sessions/${session.id}/roster`);
      const data = (await r.json()) as { roster?: Array<{ wrestlerName: string }>; error?: string };
      if (data.error) console.error('[CoachScheduleSessionCard] roster', session.id, data.error);
      const raw = (data.roster ?? []).map((x) => x.wrestlerName?.trim()).filter(Boolean) as string[];
      const names = raw.filter((x) => x !== 'Drop-in');
      if (names.length === 0 && nRegistered > 0 && attempt === 0) {
        await new Promise((res) => setTimeout(res, 500));
        if (cancelled) return [];
        return loadRoster(1);
      }
      return names;
    };

    void loadRoster(0)
      .then((names) => {
        if (cancelled) return;
        setFetchedNames(names);
      })
      .catch(() => {
        if (!cancelled) setFetchedNames([]);
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, nRegistered]);

  const showNameSpinner = nRegistered > 0 && rosterLoading && effectiveNames.length < nRegistered;
  const athleteCount = Math.max(effectiveNames.length, nRegistered);

  return (
    <div
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden',
        emphasis === 'today' ? 'border-[#D4AF37]/40 bg-[#D4AF37]/8 dark:bg-[#D4AF37]/12' : 'border-border'
      )}
    >
      <div className="px-4 pt-4 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{typeLabel}</p>
            <p className="text-base font-semibold text-foreground leading-tight">
              {formatEST(dt, 'EEEE, MMM d')}
            </p>
            <p className="text-sm text-foreground">
              {formatEST(dt, 'h:mm a')} · {dur} min
            </p>
            <p className="text-sm text-muted-foreground flex items-start gap-1.5 pt-0.5">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>{fac}</span>
            </p>
          </div>
          <CoachSessionTileActions
            sessionId={session.id}
            session={{
              id: session.id,
              join_policy: session.join_policy,
              partner_invite_code: session.partner_invite_code,
              scheduled_datetime: session.scheduled_datetime,
              session_type: session.session_type,
              session_mode: session.session_mode,
            }}
            coachDisplayName={coachDisplayName}
            facility={fac}
            scheduledDatetime={session.scheduled_datetime}
            durationMinutes={dur}
            athleteNames={effectiveNames}
            nRegistered={nRegistered}
          />
        </div>

        <div className="border-t border-border/60 pt-3">
          {nRegistered === 0 ? (
            <p className="text-sm text-muted-foreground">No athletes registered yet</p>
          ) : showNameSpinner ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
              <span>Loading roster…</span>
            </div>
          ) : effectiveNames.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {athleteCount} {athleteCount === 1 ? 'athlete' : 'athletes'}
                {rosterLoading && effectiveNames.length < nRegistered ? (
                  <span className="normal-case font-normal text-muted-foreground/80"> · loading…</span>
                ) : null}
              </p>
              <ul className="space-y-1">
                {effectiveNames.map((name, i) => (
                  <li key={`${session.id}-${i}-${name}`} className="text-sm font-medium text-foreground">
                    {name}
                  </li>
                ))}
              </ul>
              {rosterLoading && effectiveNames.length < nRegistered ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  <span>Loading full roster…</span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {nRegistered} registered — names loading…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
