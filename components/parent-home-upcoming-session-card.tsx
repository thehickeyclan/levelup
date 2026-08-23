'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Link2, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function buildSmsToCoachUrl(phone: string | null | undefined, body: string): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const e164 =
    digits.length === 11 && digits.startsWith('1')
      ? `+${digits}`
      : digits.length === 10
        ? `+1${digits}`
        : `+${digits}`;
  return `sms:${e164}?body=${encodeURIComponent(body)}`;
}

export type ParentHomeUpcomingSessionCardProps = {
  sessionId: string;
  /** e.g. "Sat, Apr 26 · 11:00 AM" */
  whenLine: string;
  detailLine: string;
  coachKidsLine: string;
  isParentInitiated: boolean;
  partnerInviteCode?: string | null;
  coachPhone?: string | null;
  coachFirstName: string;
  athleteFirstName: string;
};

export function ParentHomeUpcomingSessionCard({
  sessionId,
  whenLine,
  detailLine,
  coachKidsLine,
  isParentInitiated,
  partnerInviteCode,
  coachPhone,
  coachFirstName,
  athleteFirstName,
}: ParentHomeUpcomingSessionCardProps) {
  const router = useRouter();
  const [shareHint, setShareHint] = useState<'copied' | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const shareUrl =
    typeof window !== 'undefined'
      ? partnerInviteCode?.trim()
        ? `${window.location.origin}/join/${partnerInviteCode.trim()}`
        : `${window.location.origin}/sessions/${sessionId}`
      : '';

  const smsBody = `Hi ${coachFirstName}, just confirming ${athleteFirstName}'s session on ${whenLine.replace(' · ', ' at ')}.`;
  const smsHref = buildSmsToCoachUrl(coachPhone, smsBody);

  const onShare = async () => {
    const url = shareUrl;
    if (!url) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Training session',
          text: 'Join this Guild session',
          url,
        });
        return;
      }
    } catch {
      /* user cancelled share sheet */
    }
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setShareHint('copied');
      setTimeout(() => setShareHint(null), 2000);
    }
  };

  const onConfirmCancel = async () => {
    setCancelling(true);
    try {
      let res = await fetch(`/api/sessions/${sessionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by parent' }),
      });
      let data = await res.json();
      if (res.status === 409 && data.requiresAcknowledgement) {
        if (!window.confirm(`${data.error} This can't be undone.`)) return;
        res = await fetch(`/api/sessions/${sessionId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Cancelled by parent', acknowledgeRefunds: true }),
        });
        data = await res.json();
      }
      if (!res.ok) {
        alert(data.error || 'Could not cancel');
        return;
      }
      setCancelOpen(false);
      router.refresh();
    } catch {
      alert('Could not cancel');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">{whenLine}</p>
          <p className="text-sm text-zinc-400">{detailLine}</p>
          <p className="text-sm text-zinc-300">{coachKidsLine}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isParentInitiated && (
            <>
              <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation" asChild>
                <Link href={`/sessions/${sessionId}/reschedule`}>Reschedule</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] touch-manipulation text-destructive border-destructive/60 hover:bg-destructive/10"
                type="button"
                onClick={() => setCancelOpen(true)}
              >
                Cancel
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] touch-manipulation gap-1.5"
            type="button"
            onClick={onShare}
          >
            <Link2 className="h-4 w-4 shrink-0" />
            {shareHint === 'copied' ? 'Copied!' : 'Share'}
          </Button>
          {smsHref ? (
            <Button variant="outline" size="sm" className="min-h-[44px] touch-manipulation gap-1.5" asChild>
              <a href={smsHref}>
                <MessageSquare className="h-4 w-4 shrink-0" />
                Text coach
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this session?</DialogTitle>
            <DialogDescription>
              Your payment will be returned as Guild credit. The coach will be notified. We do not issue
              cash refunds — credit only.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Keep session
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirmCancel} disabled={cancelling}>
              {cancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Cancelling…
                </>
              ) : (
                'Confirm cancel'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
