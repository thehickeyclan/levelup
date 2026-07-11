'use client';

import { useState, useEffect } from 'react';
import { Loader2, MapPin, MoreHorizontal, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachSessionTileActions } from '@/components/coach-session-tile-actions';
import { CoachSessionRosterTransferDialog } from '@/components/coach/coach-session-roster-transfer-dialog';
import { CoachWrestlerProfileDialog } from '@/components/coach-wrestler-profile-dialog';
import { formatEST } from '@/lib/format-date';
import { sessionParticipantDisplayNames } from '@/lib/session-participant-display-name';
import { cn } from '@/lib/utils';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import {
  buildCoachTransferSessionOptions,
  type CoachTransferSessionOption,
} from '@/lib/coach-transfer-session-options';
import type { CoachSession } from './coach-schedule-card';

type RosterEntry = {
  wrestlerId: string | null;
  wrestlerName: string;
};

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
  coachId: string;
  coachDisplayName: string;
  coachSchool?: string | null;
  emphasis?: 'today' | 'default';
  /** All scheduled upcoming sessions — used to populate move targets. */
  scheduledSessionsForTransfer?: CoachSession[];
};

export function CoachScheduleSessionCard({
  session,
  coachId,
  coachDisplayName,
  coachSchool,
  emphasis = 'default',
  scheduledSessionsForTransfer = [],
}: Props) {
  const dur = (session as { duration_minutes?: number }).duration_minutes ?? 60;
  const dt = new Date(session.scheduled_datetime);
  const fac = facilityLabel(session);
  const nRegistered = registeredCount(session);
  const typeLabel = getSessionTypeDisplay(session.session_type, session.session_mode).label;

  const fromJoin = sessionParticipantDisplayNames(participantsFromSession(session));
  const [fetchedRoster, setFetchedRoster] = useState<RosterEntry[] | undefined>(undefined);
  const [rosterLoading, setRosterLoading] = useState(nRegistered > 0);
  const [profileWrestlerId, setProfileWrestlerId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const transferSessionOptions: CoachTransferSessionOption[] = buildCoachTransferSessionOptions(
    scheduledSessionsForTransfer,
    session.id
  );
  const canMoveAthletes = nRegistered > 0 && transferSessionOptions.length > 0;

  const effectiveRoster: RosterEntry[] =
    fetchedRoster !== undefined
      ? fetchedRoster
      : fromJoin.map((name) => ({ wrestlerId: null, wrestlerName: name }));

  const effectiveNames = effectiveRoster.map((r) => r.wrestlerName);

  useEffect(() => {
    if (nRegistered === 0) {
      setRosterLoading(false);
      return;
    }
    let cancelled = false;
    setRosterLoading(true);
    setFetchedRoster(undefined);

    const loadRoster = async (attempt: number): Promise<RosterEntry[]> => {
      const r = await fetch(`/api/coach/sessions/${session.id}/roster`);
      const data = (await r.json()) as {
        roster?: Array<{ wrestlerId?: string | null; wrestlerName: string }>;
        error?: string;
      };
      if (data.error) console.error('[CoachScheduleSessionCard] roster', session.id, data.error);
      const seen = new Set<string>();
      const entries: RosterEntry[] = [];
      for (const row of data.roster ?? []) {
        const name = row.wrestlerName?.trim();
        if (!name || name === 'Drop-in') continue;
        const wid = row.wrestlerId ?? null;
        const dedupeKey = wid ?? name;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        entries.push({ wrestlerId: wid, wrestlerName: name });
      }
      if (entries.length === 0 && nRegistered > 0 && attempt === 0) {
        await new Promise((res) => setTimeout(res, 500));
        if (cancelled) return [];
        return loadRoster(1);
      }
      return entries;
    };

    void loadRoster(0)
      .then((entries) => {
        if (cancelled) return;
        setFetchedRoster(entries);
      })
      .catch(() => {
        if (!cancelled) setFetchedRoster([]);
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

  const openProfile = (wrestlerId: string | null) => {
    if (!wrestlerId) return;
    setProfileWrestlerId(wrestlerId);
    setProfileOpen(true);
  };

  return (
    <>
    <div
      className={cn(
        'rounded-xl border bg-card overflow-hidden',
        emphasis === 'today' ? 'border-accent/35' : 'border-border/80'
      )}
    >
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-accent/90 bg-accent/10 px-2 py-0.5 rounded-full">
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
              <MapPin className="h-3.5 w-3.5 shrink-0 text-accent/80" aria-hidden />
              <span className="truncate">{fac}</span>
            </p>
          </div>
          <CoachSessionTileActions
            sessionId={session.id}
            coachId={coachId}
            session={{
              id: session.id,
              join_policy: session.join_policy,
              partner_invite_code: session.partner_invite_code,
              scheduled_datetime: session.scheduled_datetime,
              session_type: session.session_type,
              session_mode: session.session_mode,
            }}
            coachDisplayName={coachDisplayName}
            coachSchool={coachSchool}
            facility={fac}
            scheduledDatetime={session.scheduled_datetime}
            durationMinutes={dur}
            athleteNames={effectiveNames}
            nRegistered={nRegistered}
            canMoveAthlete={canMoveAthletes}
            onMoveAthlete={() => setTransferOpen(true)}
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
                {effectiveRoster.map((entry) => (
                  <li key={`${session.id}-${entry.wrestlerId ?? entry.wrestlerName}`} className="truncate">
                    {entry.wrestlerId ? (
                      <button
                        type="button"
                        onClick={() => openProfile(entry.wrestlerId)}
                        className="text-sm text-accent font-medium hover:underline text-left truncate max-w-full touch-manipulation"
                      >
                        {entry.wrestlerName}
                      </button>
                    ) : (
                      <span className="text-sm text-foreground">{entry.wrestlerName}</span>
                    )}
                  </li>
                ))}
              </ul>
              {canMoveAthletes ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 min-h-[36px] touch-manipulation"
                  onClick={() => setTransferOpen(true)}
                >
                  <Users className="h-4 w-4 mr-1.5 shrink-0" />
                  Move to another session
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{nRegistered} registered</p>
          )}
        </div>
      </div>
    </div>

    <CoachWrestlerProfileDialog
      wrestlerId={profileWrestlerId}
      open={profileOpen}
      onOpenChange={setProfileOpen}
    />

    <CoachSessionRosterTransferDialog
      open={transferOpen}
      onOpenChange={setTransferOpen}
      sessionId={session.id}
      sessionLabel={`${formatEST(dt, 'EEE, MMM d, yyyy h:mm a')} · ${fac}`}
      transferSessionOptions={transferSessionOptions}
    />
    </>
  );
}
