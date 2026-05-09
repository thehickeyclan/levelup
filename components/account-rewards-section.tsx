'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Gift, Link2, Share2, Copy, Check, Coins, UsersRound } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const BRAND = 'The Guild';

type ReferralsMe = {
  rewardsEnabled: boolean;
  referralCode: string | null;
  referralLink: string | null;
  referralCreditAmountDefault?: number;
  completedReferrals: number;
  pendingReferrals: number;
  referralAwaitingFirstBooking?: number;
  referralCreditOnHold?: number;
  nextReferralCreditAvailableAt?: string | null;
  nextReferralCreditAmount?: number | null;
  completedSessions: number;
  nextMilestone: {
    nextThreshold: number | null;
    creditAtNext: number | null;
    label: string | null;
  } | null;
  sessionMilestoneRewardsEnabled?: boolean;
};

function shareInviteCopy(link: string) {
  return {
    title: `Join ${BRAND}`,
    text: `You're invited to ${BRAND} — train with NCAA wrestlers and elite coaches near you.`,
    /** Some OSes append url separately in the share sheet; include link in SMS copy explicitly elsewhere. */
    url: link,
  };
}

export function AccountRewardsSection() {
  const { data, error, isLoading } = useSWR<ReferralsMe>('/api/referrals/me', fetcher);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading || error || !data?.rewardsEnabled) {
    return null;
  }

  const link = data.referralLink ?? '';
  const next = data.nextMilestone;
  const creditUsd = Number(data.referralCreditAmountDefault ?? data.nextReferralCreditAmount ?? 25);
  const progressPct =
    next?.nextThreshold != null && next.nextThreshold > 0
      ? Math.min(100, Math.round((data.completedSessions / next.nextThreshold) * 100))
      : 100;

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function shareNative() {
    if (!link) return;
    const { title, text, url } = shareInviteCopy(link);
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
      } catch {
        /* cancelled */
      }
    } else {
      await copyLink();
    }
  }

  function openSmsComposer() {
    if (!link) return;
    const { text } = shareInviteCopy(link);
    const body = encodeURIComponent(`${text}\n\n${link}`);
    window.location.href = `sms:?&body=${body}`;
  }

  const earnedReferralCredits = data.completedReferrals * creditUsd;

  const primaryLine =
    earnedReferralCredits > 0
      ? `$${earnedReferralCredits.toFixed(0)} earned from referrals`
      : `Earn $${creditUsd.toFixed(0)} Guild credit each time a referral completes their first paid booking`;

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-800/80 bg-[#09090b] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <div className="px-4 py-4 border-b border-zinc-800/80">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-zinc-500 uppercase">Refer & earn</p>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!link}
            onClick={() => link && setShareOpen(true)}
            className={cn(
              'group relative rounded-2xl p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
              'bg-gradient-to-br from-emerald-400/20 via-[#c9a227]/15 to-violet-500/25',
              'border border-white/10 hover:border-white/20 min-h-[120px] flex flex-col justify-between',
              !link && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Coins className="h-7 w-7 text-[#E8D38A] stroke-[1.25]" aria-hidden />
            <div>
              <p className="text-sm font-bold tracking-wide text-white uppercase mt-3">
                Get ${creditUsd.toFixed(0)} wallet credit
              </p>
              <p className="text-xs text-zinc-200/85 mt-1 leading-relaxed">
                Refer a family; credit hits your wallet after their first paid booking.
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={!link}
            onClick={() => link && setShareOpen(true)}
            className={cn(
              'rounded-2xl p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
              'bg-zinc-950/90 border border-zinc-600/70 hover:bg-zinc-900/95 hover:border-zinc-500/80 min-h-[120px] flex flex-col justify-between',
              !link && 'opacity-50 cursor-not-allowed'
            )}
          >
            <UsersRound className="h-7 w-7 text-zinc-400 stroke-[1.25]" aria-hidden />
            <div>
              <p className="text-sm font-bold tracking-wide text-white uppercase mt-3">Share your link</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Invite wrestling families via text, Messages, email, or social.
              </p>
            </div>
          </button>
        </div>

        {(data.referralCreditOnHold ?? 0) > 0 && data.nextReferralCreditAvailableAt && (
          <p className="text-xs text-amber-200/90 rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2.5 leading-relaxed">
            A referral family completed their first booking. Your ${(data.nextReferralCreditAmount ?? creditUsd).toFixed(0)}{' '}
            credit is on a short hold and lands in your wallet around{' '}
            <span className="font-medium">
              {formatEST(new Date(data.nextReferralCreditAvailableAt), 'MMM d, yyyy h:mm a')}
            </span>
            .
          </p>
        )}
        {(data.referralAwaitingFirstBooking ?? 0) > 0 && (
          <p className="text-xs text-zinc-500 px-1">
            {data.referralAwaitingFirstBooking}{' '}
            {data.referralAwaitingFirstBooking === 1 ? 'family signed' : 'families signed'} up with your link and
            haven&apos;t booked a paid session yet.
          </p>
        )}
        {(data.referralCreditOnHold ?? 0) === 0 &&
          (data.referralAwaitingFirstBooking ?? 0) === 0 &&
          data.pendingReferrals > 0 && (
            <p className="text-xs text-zinc-500 px-1">
              {data.pendingReferrals} referral{data.pendingReferrals === 1 ? '' : 's'} in progress.
            </p>
          )}

        <p className="text-[11px] text-zinc-600 px-1 flex items-start gap-1.5">
          <Link2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{primaryLine}. Credit applies automatically at checkout when you use your wallet.</span>
        </p>

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 border-zinc-700 text-zinc-200 hover:bg-zinc-800/80 rounded-full min-h-[44px]"
            onClick={() => void copyLink()}
            disabled={!link}
          >
            {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 border-zinc-700 text-zinc-200 hover:bg-zinc-800/80 rounded-full min-h-[44px]"
            onClick={() => void shareNative()}
            disabled={!link}
          >
            <Share2 className="h-4 w-4 mr-1.5" />
            Share
          </Button>
        </div>

        {data.sessionMilestoneRewardsEnabled && next?.nextThreshold != null && (
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3 mt-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Session milestones</p>
            <p className="text-sm text-zinc-200">
              Sessions completed: {data.completedSessions} of {next.nextThreshold}
            </p>
            <div className="h-2 bg-zinc-800 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-[#D4AF37] rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            {next.creditAtNext != null && (
              <p className="text-xs text-zinc-500 mt-1.5">
                ${next.creditAtNext.toFixed(0)} when you reach {next.nextThreshold} completed sessions
              </p>
            )}
          </div>
        )}
      </div>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent
          className={cn(
            'border-zinc-800 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black text-zinc-100 gap-6',
            'sm:rounded-3xl rounded-2xl max-w-[min(420px,calc(100vw-2rem))] pb-8 pt-10 px-6'
          )}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Gift className="h-7 w-7 text-[#D4AF37]" aria-hidden />
          </div>

          <DialogHeader className="space-y-3 text-center sm:text-center px-1">
            <DialogTitle className="text-xl sm:text-[1.35rem] font-semibold tracking-[0.12em] text-white uppercase leading-snug">
              Unlock Guild wallet credit
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-[15px] leading-relaxed tracking-normal normal-case px-1">
              {`Get $${creditUsd.toFixed(0)} wallet credit each time a referred family completes their first paid booking`}
              {' — '}released after a short hold. Perfect for wrestling families joining {BRAND}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              className={cn(
                'w-full rounded-full min-h-[52px] text-xs font-semibold uppercase tracking-[0.18em]',
                'bg-transparent border-2 border-white/90 text-white hover:bg-white/10'
              )}
              onClick={() => void shareNative()}
              disabled={!link}
            >
              Share my referral link
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full min-h-[48px] text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300 hover:bg-white/5 hover:text-white"
              onClick={() => void copyLink()}
              disabled={!link}
            >
              {copied ? 'Link copied' : 'Copy referral link'}
            </Button>
            <button
              type="button"
              disabled={!link}
              className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-300 py-3 disabled:opacity-40 min-h-[44px]"
              onClick={() => {
                openSmsComposer();
              }}
            >
              Invite via text message
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
