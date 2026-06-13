'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Loader2,
  MessageCircle,
  Pencil,
  Share2,
  Users,
  XCircle,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ContactInfoRow } from '@/components/contact-info-row';
import { buildSessionICS, downloadICS } from '@/lib/calendar-utils';
import {
  buildCoachSessionShareMessage,
  coachSessionShareUrl,
  type CoachSessionShareInput,
} from '@/lib/coach-session-share';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import { fillTemplate, getTemplate } from '@/lib/playbook-templates';
import { formatEST } from '@/lib/format-date';
import { CoachTextGroupDialog } from '@/components/coach-text-group-dialog';
import { cn } from '@/lib/utils';

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
  sessionId: string;
  session: CoachSessionShareInput;
  coachDisplayName: string;
  facility: string;
  scheduledDatetime: string;
  durationMinutes: number;
  athleteNames: string[];
  nRegistered: number;
  className?: string;
  /** Compact icon trigger for session cards (default: text "Actions"). */
  triggerIcon?: ReactNode;
  triggerLabel?: string;
};

function menuBtn(className?: string) {
  return cn(
    'w-full flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-left hover:bg-muted touch-manipulation min-h-[44px]',
    className
  );
}

export function CoachSessionTileActions({
  sessionId,
  session,
  coachDisplayName,
  facility,
  scheduledDatetime,
  durationMinutes,
  athleteNames,
  nRegistered,
  className,
  triggerIcon,
  triggerLabel = 'Session actions',
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [smsTarget, setSmsTarget] = useState('broadcast:parents');

  const dt = new Date(scheduledDatetime);
  const endIso = new Date(dt.getTime() + durationMinutes * 60 * 1000).toISOString();
  const hasAthletes = nRegistered > 0;

  const sessionLabel = `${formatEST(dt, 'EEE, MMM d · h:mm a')} · ${facility}`;

  const reminderBody = () => {
    const template =
      getTemplate('pre_session_broadcast')?.template ??
      'Coach [Coach] (The Guild) — reminder: [Athlete] @ [Date] [Time], [Facility]. See you there!';
    return fillTemplate(template, {
      athleteName: athleteNames.join(', ') || 'your athlete',
      coachName: coachDisplayName,
      date: formatEST(dt, 'EEE, MMM d'),
      time: formatEST(dt, 'h:mm a'),
      facility,
    });
  };

  const textGroup = (kind: 'parents' | 'athletes' | 'both') => {
    if (!hasAthletes) {
      window.alert('No athletes registered yet.');
      return;
    }
    setOpen(false);
    const target =
      kind === 'parents' ? 'broadcast:parents' : kind === 'athletes' ? 'broadcast:athletes' : 'broadcast:both';
    setSmsTarget(target);
    setSmsDialogOpen(true);
  };

  const onShare = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = coachSessionShareUrl(origin, session);
    const text = buildCoachSessionShareMessage({
      coachName: coachDisplayName,
      session,
      facility,
      url,
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Guild session', text, url });
        setOpen(false);
        return;
      }
    } catch {
      /* cancelled */
    }
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    }
    setOpen(false);
  };

  const onAddToCalendar = () => {
    const ics = buildSessionICS({
      id: sessionId,
      title: athleteNames.length > 0 ? athleteNames.join(', ') : 'Coaching session',
      start: dt,
      end: new Date(endIso),
      location: facility,
    });
    const safeTitle = (athleteNames[0] ?? 'session').replace(/[^a-z0-9]/gi, '-').slice(0, 40);
    downloadICS(ics, `${safeTitle}.ics`);
    setOpen(false);
  };

  const openContacts = async () => {
    setOpen(false);
    setContactsOpen(true);
    if (contacts.length > 0 || contactsLoading) return;
    setContactsLoading(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}/contacts`);
      const data = (await r.json()) as { contacts?: Contact[] };
      setContacts(data.contacts ?? []);
    } catch {
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  };

  const onCancel = async () => {
    if (
      !window.confirm(
        'Cancel this session for everyone? Parents are notified; refunds follow your usual rules.'
      )
    ) {
      return;
    }
    setCancelling(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/cancel`, {
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

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
      >
        <PopoverTrigger asChild>
          {triggerIcon ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-9 w-9 shrink-0 touch-manipulation text-muted-foreground hover:text-foreground',
                className
              )}
              disabled={cancelling}
              aria-label={triggerLabel}
            >
              {triggerIcon}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('min-h-[36px] h-9 shrink-0 touch-manipulation gap-1', className)}
              disabled={cancelling}
            >
              Actions
              <ChevronDown className="h-4 w-4 opacity-70" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
          <button
            type="button"
            className={menuBtn()}
            disabled={!hasAthletes}
            onClick={() => textGroup('parents')}
          >
            <MessageCircle className="h-4 w-4 shrink-0" />
            Text parents only
          </button>
          <button
            type="button"
            className={menuBtn()}
            disabled={!hasAthletes}
            onClick={() => textGroup('athletes')}
          >
            <MessageCircle className="h-4 w-4 shrink-0" />
            Text kids only
          </button>
          <button
            type="button"
            className={menuBtn()}
            disabled={!hasAthletes}
            onClick={() => textGroup('both')}
          >
            <MessageCircle className="h-4 w-4 shrink-0" />
            Text all parents and kids
          </button>
          <div className="my-1 h-px bg-border" />
          <button type="button" className={menuBtn()} onClick={() => void onShare()}>
            <Share2 className="h-4 w-4 shrink-0" />
            {shareCopied ? 'Link copied' : 'Share invite link'}
          </button>
          <Link
            href={`/sessions/${sessionId}/reschedule`}
            className={menuBtn()}
            onClick={() => setOpen(false)}
          >
            <CalendarClock className="h-4 w-4 shrink-0" />
            Reschedule
          </Link>
          <Link
            href={`/coach-sessions/${sessionId}/edit`}
            className={menuBtn()}
            onClick={() => setOpen(false)}
          >
            <Pencil className="h-4 w-4 shrink-0" />
            Edit session
          </Link>
          <button type="button" className={menuBtn()} onClick={onAddToCalendar}>
            <CalendarPlus className="h-4 w-4 shrink-0" />
            Add to calendar
          </button>
          <button
            type="button"
            className={menuBtn()}
            disabled={!hasAthletes}
            onClick={() => void openContacts()}
          >
            <Users className="h-4 w-4 shrink-0" />
            Contact details
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            className={menuBtn('text-destructive hover:bg-destructive/10')}
            disabled={cancelling}
            onClick={() => void onCancel()}
          >
            <XCircle className="h-4 w-4 shrink-0" />
            {cancelling ? 'Cancelling…' : 'Cancel session'}
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={contactsOpen} onOpenChange={setContactsOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contact details</DialogTitle>
            <DialogDescription>
              {formatEST(dt, 'EEE, MMM d')} · {formatEST(dt, 'h:mm a')} · {facility}
            </DialogDescription>
          </DialogHeader>
          {contactsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No contact details on file.</p>
          ) : (
            <div className="space-y-3">
              {contacts.map((c) => {
                const athlete = c.athlete;
                const parent = c.parent;
                if (!athlete && !parent) return null;
                return (
                  <div
                    key={c.participantId}
                    className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-2"
                  >
                    {athlete && (
                      <p className="font-medium text-sm">
                        {athlete.firstName} {athlete.lastName}
                      </p>
                    )}
                    {parent && (
                      <p className="text-xs text-muted-foreground">
                        Parent: {parent.firstName} {parent.lastName}
                      </p>
                    )}
                    {parent?.phone && (
                      <ContactInfoRow
                        label="Parent"
                        name={`${parent.firstName} ${parent.lastName}`}
                        phone={parent.phone}
                      />
                    )}
                    {athlete?.phone && <ContactInfoRow label="Athlete" phone={athlete.phone} />}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CoachTextGroupDialog
        sessionId={sessionId}
        open={smsDialogOpen}
        onOpenChange={setSmsDialogOpen}
        sessionLabel={sessionLabel}
        initialMessage={reminderBody()}
        initialTarget={smsTarget}
      />
    </>
  );
}
