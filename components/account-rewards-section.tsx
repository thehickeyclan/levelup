'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Gift, Link2, Share2, Copy, Check } from 'lucide-react';
import { formatEST } from '@/lib/format-date';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type ReferralsMe = {
  rewardsEnabled: boolean;
  referralCode: string | null;
  referralLink: string | null;
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

export function AccountRewardsSection() {
  const { data, error, isLoading } = useSWR<ReferralsMe>('/api/referrals/me', fetcher);
  const [copied, setCopied] = useState(false);

  if (isLoading || error || !data?.rewardsEnabled) {
    return null;
  }

  const link = data.referralLink ?? '';
  const next = data.nextMilestone;
  const progressPct =
    next?.nextThreshold != null && next.nextThreshold > 0
      ? Math.min(100, Math.round((data.completedSessions / next.nextThreshold) * 100))
      : 100;

  const shareText = `Train with NCAA wrestlers near you. Sign up at The Guild using my link: ${link}`;

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
    if (navigator.share) {
      try {
        await navigator.share({ title: 'The Guild', text: shareText, url: link });
      } catch {
        /* user cancelled */
      }
    } else {
      await copyLink();
    }
  }

  const earnedReferralCredits = data.completedReferrals * 25;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800/50">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-2">
          <Gift className="h-3.5 w-3.5 text-[#D4AF37]" />
          Rewards
        </h2>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <p className="text-xs text-zinc-500 mb-1">Your referral link</p>
          <p className="text-sm text-[#D4AF37] break-all font-mono">{link || '—'}</p>
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 border-zinc-700 text-zinc-200"
              onClick={() => void copyLink()}
              disabled={!link}
            >
              {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 border-zinc-700 text-zinc-200"
              onClick={() => void shareNative()}
              disabled={!link}
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              Share
            </Button>
          </div>
          <p className="text-xs text-zinc-600 mt-2">
            {data.completedReferrals > 0
              ? `You've referred ${data.completedReferrals} ${data.completedReferrals === 1 ? 'family' : 'families'} — $${earnedReferralCredits.toFixed(0)} in referral credits earned.`
              : 'Earn $25 when a referred family completes their first paid booking (released after a short hold).'}
          </p>
          {(data.referralCreditOnHold ?? 0) > 0 && data.nextReferralCreditAvailableAt && (
            <p className="text-xs text-amber-200/90 mt-2 rounded-md border border-amber-900/50 bg-amber-950/30 px-2.5 py-2">
              A referred family completed their first booking. Your $
              {(data.nextReferralCreditAmount ?? 25).toFixed(0)} credit is on a short hold and will hit your
              wallet around{' '}
              <span className="font-medium">
                {formatEST(new Date(data.nextReferralCreditAvailableAt), 'MMM d, yyyy h:mm a')}
              </span>{' '}
              (then it shows under Available credit). This is normal.
            </p>
          )}
          {(data.referralAwaitingFirstBooking ?? 0) > 0 && (
            <p className="text-xs text-zinc-500 mt-1">
              {data.referralAwaitingFirstBooking} signed up with your link but hasn&apos;t completed a paid
              booking yet.
            </p>
          )}
          {(data.referralCreditOnHold ?? 0) === 0 &&
            (data.referralAwaitingFirstBooking ?? 0) === 0 &&
            data.pendingReferrals > 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                {data.pendingReferrals} referral{data.pendingReferrals === 1 ? '' : 's'} in progress.
              </p>
            )}
        </div>

        {next?.nextThreshold != null && (
          <div>
            <p className="text-xs text-zinc-500 mb-2">Session milestones</p>
            <p className="text-sm text-zinc-200">
              Sessions completed: {data.completedSessions} of {next.nextThreshold} for next reward
            </p>
            <div className="h-2 bg-zinc-800 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-[#D4AF37] rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {next.creditAtNext != null && (
              <p className="text-xs text-zinc-500 mt-1.5">
                ${next.creditAtNext.toFixed(0)} credit when you reach {next.nextThreshold} completed sessions
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-zinc-600 flex items-start gap-1.5">
          <Link2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {data.sessionMilestoneRewardsEnabled
            ? 'Earn credit through session milestones and referrals. Wallet credit applies automatically at checkout when you choose to use it.'
            : 'Earn referral credit when a referred family completes their first paid booking. Wallet credit applies automatically at checkout when you choose to use it.'}
        </p>
      </div>
    </div>
  );
}
