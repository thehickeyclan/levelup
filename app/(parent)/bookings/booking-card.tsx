'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Calendar,
  User,
  MapPin,
  Share2,
  Check,
  ExternalLink,
  RotateCcw,
  Star,
  Smartphone,
  Users,
  Loader2,
} from 'lucide-react';
import { SchoolLogo } from '@/components/school-logo';
import { formatEST } from '@/lib/format-date';
import { SessionTypeBadge } from '@/components/session-type-badge';
import { ProfileImage } from '@/components/profile-image';
import { StarRating } from '@/components/star-rating';
import { CapacityBadge } from '@/components/capacity-badge';
import { isSessionOpenForParentBrowse } from '@/lib/sessions';
import { showSessionSmsCopyAndTextGroup } from '@/lib/session-sms-tools';
import { SessionPhonesCopyButtons } from '@/components/session-phones-copy-buttons';
import { CoachTextGroupDialog } from '@/components/coach-text-group-dialog';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import { AddToCalendarButton } from '@/components/add-to-calendar-button';
import { trackProductEvent } from '@/lib/product-analytics';
import { SessionContactsPanel } from '@/components/session-contacts-panel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

function easternDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

/** Other sessions the same coach can move a wrestler into (coach home only). */
export type CoachTransferSessionOption = {
  id: string;
  scheduled_datetime: string;
  facilityLabel: string;
  current_participants: number;
  max_participants: number;
};

export type BookingSession = {
  id: string;
  scheduled_datetime: string;
  status: string;
  total_price: number;
  /** Per-person price when session is pay-per-spot (e.g. small group $30). Shown when total_price is 0. */
  price_per_participant?: number;
  /** What this family actually paid (from session_participants.amount_paid). Shown when set. */
  amountPaid?: number;
  /** Family has an unpaid roster spot on a session that still accepts payment. */
  needsPayment?: boolean;
  /** Wrestler to preselect on the register / pay page. */
  unpaidWrestlerId?: string | null;
  session_type?: string;
  session_mode?: string;
  /** Session focus/topic for group/small_group (e.g. "Neutral Re-Attacks"). */
  focus_area?: string | null;
  /** Second optional focus for small group. */
  focus_area_2?: string | null;
  /** For capacity badge when max_participants > 1. */
  current_participants?: number;
  max_participants?: number;
  partner_invite_code?: string | null;
  /** Small group or partner-open session not yet filled (open slots). */
  isTentative?: boolean;
  /** True if current user created this session (can cancel whole session). False = participant (can leave session). */
  isOwner?: boolean;
  /**
   * False = this user’s family has no spot (e.g. admin seeing all sessions on Home).
   * Omit/true = family is enrolled — show Leave when applicable.
   */
  isFamilyParticipant?: boolean;
  /** For Join CTA when not enrolled */
  joinPolicy?: string | null;
  coach: { name: string; school: string; id: string; photo_url?: string | null; average_rating?: number | null; review_count?: number | null };
  facility: string;
  facility_id?: string | null;
  wrestlers: string[];
  primaryWrestlerId?: string | null;
  /** True if this parent has reviewed this coach (any session); we do not nag per session. */
  hasReviewed?: boolean;
};

interface BookingCardProps {
  session: BookingSession;
  isPast?: boolean;
  /** Admin Home (all sessions): show Copy Cell #s + Text group — APIs allow admin only */
  showAdminSmsTools?: boolean;
  /** Coach home: same layout as parent card, with earnings + reg link + contacts */
  variant?: 'parent' | 'coach';
  /** Required when variant is coach — projected / max payout for this session */
  coachEarnings?: { projected: number; max: number };
  /**
   * When set on coach cards, shows "Roster & transfer" to list athletes and move them to another session.
   * Omit on parent cards.
   */
  coachTransferSessionOptions?: CoachTransferSessionOption[];
}

export function BookingCard({
  session,
  isPast = false,
  showAdminSmsTools = false,
  variant = 'parent',
  coachEarnings,
  coachTransferSessionOptions,
}: BookingCardProps) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [regLinkCopied, setRegLinkCopied] = useState(false);
  const [textGroupOpen, setTextGroupOpen] = useState(false);

  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterData, setRosterData] = useState<
    Array<{
      id: string;
      wrestlerName: string;
      photoUrl: string | null;
      paid: boolean;
      amountPaid: number;
      isDropIn: boolean;
    }>
  >([]);
  const [transferringParticipant, setTransferringParticipant] = useState<{
    id: string;
    wrestlerName: string;
    amountPaid: number;
    paid: boolean;
  } | null>(null);
  const [transferTargetSessionId, setTransferTargetSessionId] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  const openCoachRoster = async () => {
    setRosterOpen(true);
    setRosterLoading(true);
    setTransferringParticipant(null);
    setTransferTargetSessionId('');
    try {
      const res = await fetch(`/api/coach/sessions/${session.id}/roster`);
      const data = await res.json();
      if (!res.ok) {
        setRosterData([]);
        alert(data.error || 'Could not load roster');
        return;
      }
      setRosterData(data.roster || []);
    } catch {
      setRosterData([]);
    } finally {
      setRosterLoading(false);
    }
  };

  const handleCoachTransferRegistration = async () => {
    if (!transferringParticipant || !transferTargetSessionId) return;
    setTransferLoading(true);
    try {
      const res = await fetch('/api/coach/sessions/transfer-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: transferringParticipant.id,
          fromSessionId: session.id,
          toSessionId: transferTargetSessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Transfer failed');
        return;
      }
      alert(
        `Successfully transferred ${transferringParticipant.wrestlerName} with $${transferringParticipant.amountPaid} payment preserved`
      );
      setTransferringParticipant(null);
      setTransferTargetSessionId('');
      setRosterLoading(true);
      try {
        const r = await fetch(`/api/coach/sessions/${session.id}/roster`);
        const d = await r.json();
        setRosterData(r.ok ? d.roster || [] : []);
      } finally {
        setRosterLoading(false);
      }
      router.refresh();
    } catch (err) {
      alert('Transfer failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTransferLoading(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!session.partner_invite_code) return;
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${session.partner_invite_code}`;
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleCopyRegLink = async () => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/sessions/${session.id}/register`;
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setRegLinkCopied(true);
      setTimeout(() => setRegLinkCopied(false), 2000);
    }
  };

  const scheduledTime = new Date(session.scheduled_datetime);
  const canCancel = !isPast && session.status === 'scheduled' && scheduledTime > new Date();
  const isSessionDayOfOrPast = easternDateKey(scheduledTime) <= easternDateKey(new Date());
  
  const familyHasSpot = session.isFamilyParticipant !== false;
  const canLeave = canCancel && !isSessionDayOfOrPast && !session.isOwner && familyHasSpot;
  const showJoinWhenNotEnrolled =
    variant !== 'coach' &&
    session.isFamilyParticipant === false &&
    !isPast &&
    isSessionOpenForParentBrowse(session) &&
    (session.joinPolicy === 'public' || session.joinPolicy === 'invite_only');

  const payRegisterHref =
    session.unpaidWrestlerId
      ? `/sessions/${session.id}/register?wrestler=${encodeURIComponent(session.unpaidWrestlerId)}`
      : `/sessions/${session.id}/register`;
  const showPayNow =
    variant === 'parent' && session.needsPayment === true && session.status !== 'cancelled';
  const handleLeaveSession = async () => {
    setLeaving(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/leave`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to leave session');
        return;
      }
      alert(data.message);
      setShowLeaveConfirm(false);
      router.refresh();
    } catch (e) {
      console.error('Leave error:', e);
      alert('Failed to leave session');
    } finally {
      setLeaving(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by parent' }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error || 'Failed to cancel session');
        return;
      }
      
      alert(data.message);
      router.refresh();
    } catch (e) {
      console.error('Cancel error:', e);
      alert('Failed to cancel session');
    } finally {
      setCancelling(false);
      setShowConfirm(false);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'scheduled') return <Badge>Open</Badge>;
    if (status === 'completed') return <Badge variant="default">Paid</Badge>;
    if (status === 'cancelled') return <Badge variant="secondary">Cancelled</Badge>;
    if (status === 'no-show') return <Badge variant="secondary">No-show</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const adminSmsRow =
    showAdminSmsTools && !isPast && showSessionSmsCopyAndTextGroup(session);
  const coachSmsDialog =
    variant === 'coach' && !isPast && showSessionSmsCopyAndTextGroup(session);
  const coachBookedCount = Math.max(
    session.current_participants ?? 0,
    session.wrestlers.length
  );

  return (
    <Card className={isPast ? 'bg-muted/20' : ''}>
      {(adminSmsRow || coachSmsDialog) && (
        <CoachTextGroupDialog
          sessionId={session.id}
          open={textGroupOpen}
          onOpenChange={setTextGroupOpen}
          sessionLabel={`${formatEST(scheduledTime, 'EEE, MMM d · h:mm a')} · ${session.facility}`}
          onSent={() => router.refresh()}
        />
      )}
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-4">
          <div className="flex gap-3 flex-1 min-w-0">
            <ProfileImage
              src={session.coach.photo_url}
              alt={session.coach.name}
              className="w-12 h-12 shrink-0 rounded-full object-cover border border-border"
              fallbackIconClassName="h-6 w-6 text-muted-foreground"
            />
            <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SessionTypeBadge sessionType={session.session_type} sessionMode={session.session_mode} />
              {(session.focus_area || session.focus_area_2) && (
                <Badge variant="secondary" className="font-normal text-xs">
                  {[session.focus_area, session.focus_area_2].filter(Boolean).join(', ')}
                </Badge>
              )}
              {statusBadge(session.status)}
              {session.isTentative && (
                <Badge variant="outline" className="text-xs border-amber-500/60 text-amber-700 dark:text-amber-400 bg-amber-500/15">
                  Tentative
                </Badge>
              )}
            </div>
            <p className="font-semibold text-foreground">
              {isPast
                ? formatEST(scheduledTime, 'EEE, MMM d, yyyy')
                : formatEST(scheduledTime, 'EEEE, MMM d, yyyy')}
              {' · '}
              {formatEST(scheduledTime, 'h:mm a')}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {session.facility}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <User className="h-3.5 w-3.5 shrink-0" />
              {session.coach.id && String(session.coach.id).trim() ? (
                variant === 'coach' ? (
                  <span className="text-foreground font-medium">{session.coach.name}</span>
                ) : (
                  <Link href={`/athlete/${String(session.coach.id).trim()}`} className="hover:underline text-foreground font-medium">
                    {session.coach.name}
                  </Link>
                )
              ) : (
                session.coach.name
              )}
              {session.coach.school && (
                <span className="flex items-center gap-1">
                  <SchoolLogo school={session.coach.school} size="sm" />
                  <span className="text-muted-foreground/80">({session.coach.school})</span>
                </span>
              )}
              {variant !== 'coach' && session.coach.id && String(session.coach.id).trim() && (
                <Link href={`/athlete/${String(session.coach.id).trim()}`} className="text-xs text-accent hover:underline">
                  View profile
                </Link>
              )}
            </p>
            {variant !== 'coach' && (
              <StarRating averageRating={session.coach.average_rating} reviewCount={session.coach.review_count} size="sm" />
            )}
            {variant === 'coach' && !isPast && (
              <div className="rounded-lg border border-accent/25 bg-accent/10 px-3 py-3 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Users className="h-4 w-4 shrink-0 text-accent" />
                  <span className="text-sm font-semibold text-foreground">
                    {coachBookedCount === 0
                      ? 'No athletes booked yet'
                      : `${coachBookedCount} athlete${coachBookedCount !== 1 ? 's' : ''}`}
                  </span>
                  {(session.max_participants ?? 1) > 1 && (
                    <CapacityBadge
                      current={session.current_participants ?? 0}
                      max={session.max_participants ?? 1}
                      label="spots"
                    />
                  )}
                </div>
                {session.wrestlers.length > 0 ? (
                  <p className="text-sm font-medium text-foreground leading-snug">{session.wrestlers.join(', ')}</p>
                ) : coachBookedCount > 0 ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                    Loading names…
                  </p>
                ) : null}
                {coachBookedCount > 0 && (
                  <div className="flex flex-col gap-2 pt-0.5">
                    <SessionPhonesCopyButtons sessionId={session.id} />
                    {showSessionSmsCopyAndTextGroup(session) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] touch-manipulation w-full sm:flex-1 gap-1 border-accent/50 text-accent"
                        onClick={() => setTextGroupOpen(true)}
                      >
                        <Smartphone className="h-4 w-4 shrink-0" />
                        Text group
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            {variant !== 'coach' && (session.max_participants ?? 1) > 1 && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CapacityBadge
                  current={session.current_participants ?? 0}
                  max={session.max_participants ?? 1}
                  label="spots"
                />
              </p>
            )}
            {variant !== 'coach' && session.wrestlers.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {session.wrestlers.join(', ')}
              </p>
            )}
            </div>
          </div>
          <div className="text-left sm:text-right flex flex-col sm:items-end gap-2 shrink-0">
            <p
              className={
                isPast
                  ? 'font-bold'
                  : variant === 'coach'
                    ? 'text-xl font-bold text-accent'
                    : 'text-xl font-bold'
              }
            >
              {variant === 'coach' && coachEarnings ? (
                (() => {
                  const { projected, max } = coachEarnings;
                  if (projected > 0) return `Earning: $${projected.toFixed(0)}`;
                  if (max > 0) return `Up to $${max.toFixed(0)} when booked`;
                  return '—';
                })()
              ) : session.amountPaid != null && session.amountPaid > 0
                ? `You paid $${Number(session.amountPaid).toFixed(2)}`
                : session.total_price > 0
                  ? `$${Number(session.total_price).toFixed(2)}`
                  : session.price_per_participant != null && session.price_per_participant > 0
                    ? `$${Number(session.price_per_participant).toFixed(2)} /person`
                    : `$${Number(session.total_price).toFixed(2)}`}
            </p>
            <div className="flex flex-col gap-2 sm:items-end">
              {!isPast && (
                <Link href={`/sessions/${session.id}`} className="inline-flex" prefetch={false}>
                  <Button size="sm" className="min-h-[44px] px-4">
                    <ExternalLink className="h-4 w-4 mr-1 shrink-0" />
                    View
                  </Button>
                </Link>
              )}
              {adminSmsRow && (
                <div className="flex flex-col gap-2 w-full sm:w-auto sm:items-end">
                  <SessionPhonesCopyButtons sessionId={session.id} layout="row" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[40px] gap-1 border-accent/50 text-accent w-full sm:w-auto"
                    onClick={() => setTextGroupOpen(true)}
                  >
                    <Smartphone className="h-4 w-4 shrink-0" />
                    Text group
                  </Button>
                </div>
              )}
              {showPayNow && (
                <Link href={payRegisterHref} className="inline-flex w-full sm:w-auto" prefetch={false}>
                  <Button size="sm" className="min-h-[44px] px-4 w-full sm:w-auto bg-accent text-primary hover:bg-accent/90">
                    Pay now
                  </Button>
                </Link>
              )}
              {!isPast && showJoinWhenNotEnrolled && (
                <Link href={`/sessions/${session.id}/register`} className="inline-flex" prefetch={false}>
                  <Button size="sm" className="min-h-[44px] px-4 bg-accent text-primary hover:bg-accent/90">
                    Join now
                  </Button>
                </Link>
              )}
              {!isPast && (
                <div className="flex flex-wrap gap-2">
                  {session.isOwner && (
                    <Link href={`/sessions/${session.id}/reschedule`}>
                      <Button variant="outline" size="sm" className="min-h-[40px] px-3">Reschedule</Button>
                    </Link>
                  )}
                  {session.isOwner && canCancel && !showConfirm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowConfirm(true)}
                      className="min-h-[40px] px-3 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      Cancel
                    </Button>
                  )}
                  {canLeave && !showLeaveConfirm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowLeaveConfirm(true)}
                      className="min-h-[40px] px-3 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      Leave session
                    </Button>
                  )}
                </div>
              )}
              {/* Past completed: show until parent has reviewed this coach (any session) */}
              {isPast && session.status === 'completed' && !session.hasReviewed && (
                <Link href={`/sessions/${session.id}/review`} className="inline-flex w-full sm:w-auto">
                  <Button size="sm" className="w-full sm:w-auto min-h-[44px] px-4 bg-accent hover:bg-accent/90 text-primary">
                    <Star className="h-4 w-4 mr-1 shrink-0 fill-current" />
                    Rate coach
                  </Button>
                </Link>
              )}
              {isPast && session.coach.id && (
                <Link
                  href={
                    `/training?tab=sessions&coach=${session.coach.id}` +
                    (session.facility_id ? `&location=${session.facility_id}` : '') +
                    (session.primaryWrestlerId ? `&wrestler=${session.primaryWrestlerId}` : '')
                  }
                  onClick={() =>
                    trackProductEvent('parent_book_again_clicked', {
                      coachId: session.coach.id,
                      priorSessionType: session.session_type ?? 'unknown',
                    })
                  }
                  className="inline-flex"
                >
                  <Button variant="outline" size="sm" className="min-h-[40px] px-3">
                    <RotateCcw className="h-4 w-4 mr-1 shrink-0" />
                    Book again
                  </Button>
                </Link>
              )}
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {session.partner_invite_code && !isPast && (
                  <button
                    type="button"
                    onClick={handleCopyShareLink}
                    className="hover:text-foreground underline"
                    title="Copy invite link"
                  >
                    {linkCopied ? 'Copied!' : 'Share link'}
                  </button>
                )}
              </div>
            </div>
            
            {/* Cancel whole session (owner only) */}
            {showConfirm && (
              <div className="mt-2 p-3 border border-destructive/50 rounded-lg bg-destructive/5 text-left w-full max-w-xs">
                <p className="text-sm font-medium mb-2">Cancel this session?</p>
                <p className="text-xs text-muted-foreground mb-3">
                  {variant === 'coach'
                    ? 'This cancels the session for all booked wrestlers. Parents get wallet credit for what they paid (usable on any coach).'
                    : `Wallet credit for what you paid (around $${Number(session.total_price).toFixed(2)}) will be added — usable on any coach.`}
                </p>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setShowConfirm(false)}
                    disabled={cancelling}
                  >
                    Keep session
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={handleCancel}
                    disabled={cancelling}
                  >
                    {cancelling ? 'Cancelling...' : 'Yes, cancel'}
                  </Button>
                </div>
              </div>
            )}
            {/* Leave session (participant: free up my spot) */}
            {showLeaveConfirm && (
              <div className="mt-2 p-3 border border-destructive/50 rounded-lg bg-destructive/5 text-left w-full max-w-xs">
                <p className="text-sm font-medium mb-2">Leave this session?</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Your spot will open for someone else. If you already paid, you&apos;ll receive wallet credit for what you paid — usable on any coach.
                </p>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setShowLeaveConfirm(false)}
                    disabled={leaving}
                  >
                    Keep my spot
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={handleLeaveSession}
                    disabled={leaving}
                  >
                    {leaving ? 'Leaving…' : 'Yes, leave'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        {variant === 'coach' && !isPast && coachTransferSessionOptions !== undefined && (
          <Dialog
            open={rosterOpen}
            onOpenChange={(open) => {
              setRosterOpen(open);
              if (!open) {
                setTransferringParticipant(null);
                setTransferTargetSessionId('');
              }
            }}
          >
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Session roster
                </DialogTitle>
                <DialogDescription>
                  {formatEST(scheduledTime, 'EEE, MMM d, yyyy h:mm a')} · {session.facility}
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                {rosterLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : rosterData.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No participants registered</p>
                ) : (
                  <div className="space-y-3">
                    {rosterData.map((p, idx) => (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="font-medium text-muted-foreground w-6">{idx + 1}.</div>
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                            {p.wrestlerName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex items-center gap-2 flex-wrap">
                            {p.wrestlerName}
                            {p.isDropIn && (
                              <Badge variant="outline" className="text-xs">
                                Drop-in
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="font-medium tabular-nums">${Number(p.amountPaid || 0).toFixed(2)}</div>
                            {p.paid ? (
                              <Badge variant="outline" className="text-xs border-emerald-600/50 bg-emerald-600/10">
                                Paid
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs border-amber-600/50 bg-amber-600/10">
                                Pending
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-accent"
                            onClick={() =>
                              setTransferringParticipant({
                                id: p.id,
                                wrestlerName: p.wrestlerName,
                                amountPaid: p.amountPaid,
                                paid: p.paid,
                              })
                            }
                          >
                            Transfer
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {transferringParticipant && (
                  <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30">
                    <div className="font-medium mb-2">
                      Transfer {transferringParticipant.wrestlerName} ($
                      {Number(transferringParticipant.amountPaid || 0).toFixed(2)}{' '}
                      {transferringParticipant.paid ? 'paid' : 'due — payment not completed yet'})
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coach-transfer-target">Move to session</Label>
                      <select
                        id="coach-transfer-target"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={transferTargetSessionId}
                        onChange={(e) => setTransferTargetSessionId(e.target.value)}
                      >
                        <option value="">Select a session…</option>
                        {coachTransferSessionOptions
                          .filter((s) => new Date(s.scheduled_datetime) > new Date())
                          .sort(
                            (a, b) =>
                              new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
                          )
                          .slice(0, 30)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {formatEST(new Date(s.scheduled_datetime), 'MMM d h:mm a')} · {s.facilityLabel} (
                              {s.current_participants}/{s.max_participants})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTransferringParticipant(null);
                          setTransferTargetSessionId('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={!transferTargetSessionId || transferLoading}
                        onClick={handleCoachTransferRegistration}
                      >
                        {transferLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm transfer'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRosterOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {variant === 'coach' && !isPast && (
          <>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {coachTransferSessionOptions !== undefined && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[40px] touch-manipulation"
                  onClick={openCoachRoster}
                >
                  <Users className="h-4 w-4 mr-1 shrink-0" />
                  Roster & transfer
                </Button>
              )}
              <AddToCalendarButton
                sessionId={session.id}
                title={session.wrestlers.length > 0 ? session.wrestlers.join(', ') : 'Coaching session'}
                start={session.scheduled_datetime}
                location={session.facility}
                size="sm"
                className="min-h-[40px] touch-manipulation"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[40px] touch-manipulation"
                onClick={handleCopyRegLink}
              >
                {regLinkCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-1 shrink-0" />
                    Copied
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4 mr-1 shrink-0" />
                    Registration link
                  </>
                )}
              </Button>
            </div>
            <SessionContactsPanel
              sessionId={session.id}
              participantCount={session.current_participants ?? 0}
              className="mt-2"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
