'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Link2, Loader2, MessageCircle, Share2, Check, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddToCalendarButton } from '@/components/add-to-calendar-button';
import { ContactInfoRow } from '@/components/contact-info-row';
import { formatEST } from '@/lib/format-date';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import { fillTemplate, getTemplate } from '@/lib/playbook-templates';
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
  const rows = Array.isArray(s.session_participants) ? s.session_participants.length : 0;
  return Math.max(rows, s.current_participants ?? 0);
}

type Contact = {
  participantId: string;
  athlete: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  } | null;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  } | null;
};

type Props = {
  session: CoachSession;
  coachDisplayName: string;
  emphasis?: 'today' | 'default';
};

export function CoachScheduleSessionCard({ session, coachDisplayName, emphasis = 'default' }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsFetched, setContactsFetched] = useState(false);
  const [regCopied, setRegCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const dur = (session as { duration_minutes?: number }).duration_minutes ?? 60;
  const dt = new Date(session.scheduled_datetime);
  const fac = facilityLabel(session);
  const nRegistered = registeredCount(session);

  const fromJoin = sessionParticipantDisplayNames(session.session_participants);
  const [fetchedNames, setFetchedNames] = useState<string[] | undefined>(undefined);
  const [rosterLoading, setRosterLoading] = useState(false);

  const effectiveNames = fromJoin.length > 0 ? fromJoin : (fetchedNames ?? []);

  useEffect(() => {
    if (nRegistered === 0 || fromJoin.length > 0 || fetchedNames !== undefined) return;
    let cancelled = false;
    setRosterLoading(true);
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
      if (names.length === 0 && nRegistered > 0) {
        console.error('[CoachScheduleSessionCard] roster empty but participants > 0', session.id);
      }
      return names;
    };

    void loadRoster(0)
      .then((names) => {
        if (cancelled) return;
        setFetchedNames(names);
      })
      .catch((e) => {
        console.error('[CoachScheduleSessionCard] roster fetch', session.id, e);
        if (!cancelled) setFetchedNames([]);
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, nRegistered, fromJoin.length, fetchedNames]);

  useEffect(() => {
    if (!expanded || contactsFetched) return;
    setContactsLoading(true);
    void fetch(`/api/sessions/${session.id}/contacts`)
      .then((r) => r.json())
      .then((data: { contacts?: Contact[] }) => {
        setContacts(data.contacts ?? []);
        setContactsFetched(true);
      })
      .catch(() => setContacts([]))
      .finally(() => setContactsLoading(false));
  }, [expanded, contactsFetched, session.id]);

  const typeLabelUpper = getSessionTypeDisplay(session.session_type, session.session_mode).label.toUpperCase();
  const headerLine = `${typeLabelUpper} · ${formatEST(dt, 'EEE, MMM d')} · ${formatEST(dt, 'h:mm a')}`;

  const openCombinedSms = async () => {
    if (nRegistered === 0) {
      window.alert('No athletes registered yet.');
      return;
    }
    try {
      const r = await fetch(`/api/sessions/${session.id}/sms-phones`);
      const data = (await r.json()) as { commaParents?: string; error?: string };
      if (!r.ok) {
        window.alert(data.error || 'Could not load numbers.');
        return;
      }
      const raw = (data.commaParents ?? '').trim();
      if (!raw) {
        window.alert('No phone numbers on file for this session yet.');
        return;
      }
      const lines = raw.split(/\r?\n/).map((s) => s.replace(/\D/g, '')).filter(Boolean);
      const uniq: string[] = [];
      for (const d of lines) {
        const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
        if (ten.length === 10 && !uniq.includes(ten)) uniq.push(ten);
      }
      if (uniq.length === 0) {
        window.alert('No valid numbers on file.');
        return;
      }
      const namesStr = effectiveNames.join(', ');
      const template =
        getTemplate('pre_session_broadcast')?.template ??
        'Coach [Coach] (The Guild) — reminder: [Athlete] @ [Date] [Time], [Facility]. See you there!';
      const smsBody = fillTemplate(template, {
        athleteName: namesStr || 'your athlete',
        coachName: coachDisplayName,
        date: formatEST(dt, 'EEE, MMM d'),
        time: formatEST(dt, 'h:mm a'),
        facility: fac,
      });
      const body = encodeURIComponent(smsBody);
      window.location.href = `sms:${uniq.join(',')}?body=${body}`;
    } catch {
      window.alert('Something went wrong. Try again.');
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/sessions/${session.id}/register`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Book this session', url });
        return;
      }
    } catch {
      /* user cancelled or share failed */
    }
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const copyRegLink = async () => {
    const url = `${window.location.origin}/sessions/${session.id}/register`;
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setRegCopied(true);
      window.setTimeout(() => setRegCopied(false), 2000);
    }
  };

  const handleCancel = async () => {
    if (
      !window.confirm(
        'Cancel this session for everyone? Parents are notified; refunds follow your usual rules.'
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by coach' }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || 'Failed to cancel');
        return;
      }
      window.alert(data.message || 'Session cancelled');
      router.refresh();
    } catch {
      window.alert('Failed to cancel session');
    } finally {
      setCancelling(false);
    }
  };

  const showNameSpinner = nRegistered > 0 && effectiveNames.length === 0 && rosterLoading;
  const showNames = effectiveNames.length > 0;
  const endIso = new Date(dt.getTime() + dur * 60 * 1000).toISOString();

  return (
    <div
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden',
        emphasis === 'today' ? 'border-[#D4AF37]/40 bg-[#D4AF37]/8 dark:bg-[#D4AF37]/12' : 'border-border'
      )}
    >
      <button
        type="button"
        className="w-full text-left px-4 pt-4 pb-2 min-h-[44px] touch-manipulation cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50 rounded-t-xl"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <p className="text-sm font-semibold text-foreground leading-snug">{headerLine}</p>
        <p className="text-sm text-foreground mt-1.5">
          {fac} · {dur} min
        </p>
        <div className="mt-3 flex items-start gap-2 min-h-[1.5rem]">
          <span className="text-muted-foreground shrink-0" aria-hidden>
            👤
          </span>
          <div className="flex-1 min-w-0">
            {nRegistered === 0 ? (
              <p className="text-sm text-muted-foreground">No athletes yet</p>
            ) : showNameSpinner ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                <span>Loading names…</span>
              </div>
            ) : showNames ? (
              <ul className="space-y-1">
                {effectiveNames.map((name) => (
                  <li key={name} className="text-sm font-medium text-foreground">
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No athletes yet</p>
            )}
          </div>
        </div>
      </button>

      <div className="px-4 pb-4 flex flex-col sm:flex-row gap-2" onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant="default"
          className="min-h-[44px] touch-manipulation flex-1"
          onClick={() => void openCombinedSms()}
          disabled={nRegistered === 0}
        >
          <MessageCircle className="h-4 w-4 mr-2 shrink-0" />
          Text parents
        </Button>
        <Button variant="outline" asChild className="min-h-[44px] touch-manipulation flex-1 border-[#D4AF37]/40">
          <Link href={`/sessions/${session.id}/reschedule`}>
            <CalendarClock className="h-4 w-4 mr-2 shrink-0" />
            Reschedule
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] touch-manipulation flex-1 border-[#D4AF37]/40"
          onClick={() => void handleShare()}
        >
          {shareCopied ? (
            <>
              <Check className="h-4 w-4 mr-2 text-emerald-500" />
              Copied!
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4 mr-2 shrink-0" />
              Share
            </>
          )}
        </Button>
      </div>

      {expanded && (
        <div
          className="border-t border-border px-4 py-4 space-y-4 bg-muted/20"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact info</p>
          <p className="text-xs text-muted-foreground">
            Text the <span className="font-medium text-foreground/90">parent</span> first when possible — they usually handle booking and follow-up.
          </p>
          {contactsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 && nRegistered > 0 ? (
            <p className="text-sm text-muted-foreground">No contact details loaded.</p>
          ) : (
            contacts.map((c) => {
              const athlete = c.athlete;
              const parent = c.parent;
              if (!athlete && !parent) return null;
              return (
                <div key={c.participantId} className="rounded-lg border border-border/80 bg-background/80 p-3 space-y-2">
                  {athlete && (
                    <p className="font-medium text-sm text-foreground">
                      {athlete.firstName} {athlete.lastName}
                    </p>
                  )}
                  {parent && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        <span aria-hidden>👤</span> Parent: {parent.firstName} {parent.lastName}
                      </p>
                      {parent.phone && (
                        <ContactInfoRow label="Parent" name={`${parent.firstName} ${parent.lastName}`} phone={parent.phone} />
                      )}
                    </>
                  )}
                  {athlete?.phone && <ContactInfoRow label="Athlete" phone={athlete.phone} />}
                </div>
              );
            })
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] touch-manipulation w-full text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => void handleCancel()}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling…' : 'Cancel session'}
            </Button>
            <Button type="button" variant="outline" className="min-h-[44px] touch-manipulation w-full" onClick={() => void copyRegLink()}>
              {regCopied ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-emerald-500" />
                  Copied registration link
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Copy registration link
                </>
              )}
            </Button>
            <AddToCalendarButton
              sessionId={session.id}
              title={effectiveNames.length > 0 ? effectiveNames.join(', ') : 'Coaching session'}
              start={session.scheduled_datetime}
              end={endIso}
              location={fac}
              className="w-full min-h-[44px] touch-manipulation"
            />
          </div>
        </div>
      )}
    </div>
  );
}
