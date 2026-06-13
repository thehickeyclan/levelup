'use client';

import { useState, useEffect } from 'react';
import { Loader2, MapPin, MoreHorizontal } from 'lucide-react';
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

  const effectiveNames =
    fetchedNames !== undefined ? fetchedNames : fromJoin.length > 0 ? fromJoin : [];

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

  const athleteCount = Math.max(effectiveNames.length, nRegistered);
  const rosterReady = !rosterLoading || effectiveNames.length >= nRegistered;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card overflow-hidden',
        emphasis === 'today' ? 'border-[#D4AF37]/35' : 'border-border/80'
      )}
    >
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-[#D4AF37]/90 bg-[#D4AF37]/10 px-2 py-0.5 rounded-full">
                {typeLabel}
              </span>
              {emphasis === 'today' ? (
                <span className="text-[11px] font-medium text-foreground/80">Today</span>
              ) : null}
            </div>
            <p className="text-[15px] font-semibold text-foreground leading-tight">
              {formatEST(dt, 'EEEE, MMM d')}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatEST(dt, 'h:mm a')} · {dur} min
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]/80" aria-hidden />
              <span className="truncate">{fac}</span>
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
            triggerIcon={<MoreHorizontal className="h-5 w-5" />}
            triggerLabel="Session actions"
          />
        </div>

        <div className="mt-3 pt-3 border-t border-border/50">
          {nRegistered === 0 ? (
            <p className="text-sm text-muted-foreground">No athletes registered yet</p>
          ) : !rosterReady && effectiveNames.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
              <span>Loading roster…</span>
            </div>
          ) : effectiveNames.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                {athleteCount} {athleteCount === 1 ? 'athlete' : 'athletes'}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {effectiveNames.map((name, i) => (
                  <li key={`${session.id}-${i}-${name}`} className="text-sm text-foreground truncate">
                    {name}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{nRegistered} registered</p>
          )}
        </div>
      </div>
    </div>
  );
}
