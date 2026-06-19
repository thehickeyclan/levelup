'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageThread } from '@/components/guild/message-thread';
import { TradeOfferListingReviewCard } from '@/components/market/trade-offer-listing-review';
import type { TradeOfferListingReview } from '@/lib/market/trade-listing-review';
import { cn } from '@/lib/utils';

export type TradeListingCard = TradeOfferListingReview;

export type TradePageData = {
  id: string;
  status: string;
  boot_amount_cents: number;
  initiator_fee_paid: boolean;
  receiver_fee_paid: boolean;
  initiator_listing: TradeListingCard;
  receiver_listing: TradeListingCard;
  initiator_name: string;
  receiver_name: string;
  viewer_side: 'initiator' | 'receiver';
  viewer_fee_paid: boolean;
  other_party_name: string;
  expires_at: string | null;
};

const STEPS = ['Pending', 'Accepted', 'Fees paid', 'Complete'];

function stepIndex(status: string, initiatorPaid: boolean, receiverPaid: boolean): number {
  if (status === 'completed') return 3;
  if (status === 'fees_pending' || (initiatorPaid && receiverPaid)) return 2;
  if (status === 'receiver_accepted') return 1;
  return 0;
}

export function TradeStatusClient({
  trade,
  feePaidBanner,
  currentUserId,
  threadId,
}: {
  trade: TradePageData;
  feePaidBanner: boolean;
  currentUserId: string;
  threadId: string | null;
}) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const current = stepIndex(trade.status, trade.initiator_fee_paid, trade.receiver_fee_paid);
  const needsFee =
    ['receiver_accepted', 'fees_pending'].includes(trade.status) && !trade.viewer_fee_paid;
  const canCancel =
    ['receiver_accepted', 'fees_pending'].includes(trade.status) && !trade.viewer_fee_paid;
  const waitingOnOther =
    ['receiver_accepted', 'fees_pending'].includes(trade.status) &&
    trade.viewer_fee_paid &&
    !(trade.initiator_fee_paid && trade.receiver_fee_paid);
  const otherPaidFee = trade.initiator_fee_paid || trade.receiver_fee_paid;

  const payFee = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/market/trade/${trade.id}/fee`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(false);
    }
  };

  const respond = async (action: 'accept' | 'decline') => {
    setActing(true);
    try {
      const res = await fetch(`/api/market/trade/${trade.id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      router.refresh();
    } finally {
      setActing(false);
    }
  };

  const cancelTrade = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/market/trade/${trade.id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      router.push('/market/offers');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(false);
      setShowCancelConfirm(false);
    }
  };

  const expiryLabel =
    trade.expires_at && new Date(trade.expires_at) > new Date()
      ? formatDistanceToNow(new Date(trade.expires_at), { addSuffix: true })
      : null;

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6 bg-background">
      <BackLink fallbackHref="/market/offers" label="Back" />

      {feePaidBanner ? (
        <p className="text-sm text-accent bg-accent/10 border border-accent/30 rounded-lg p-3">
          Fee payment received — waiting for your trade partner.
        </p>
      ) : null}

      {trade.status === 'completed' ? (
        <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          Trade complete — coordinate shipping directly with your trade partner ({trade.other_party_name}).
        </p>
      ) : null}

      {trade.status === 'expired' || trade.status === 'cancelled' ? (
        <p className="text-sm text-muted-foreground bg-muted border border-border rounded-lg p-3">
          This trade is {trade.status}. Both pairs are active again in the market.
        </p>
      ) : null}

      <div className="space-y-4">
        <TradeOfferListingReviewCard
          listing={trade.initiator_listing}
          label={`${trade.initiator_name}'s pair`}
        />
        <div className="flex justify-center">
          <span className="text-2xl text-muted-foreground">⇄</span>
        </div>
        <TradeOfferListingReviewCard
          listing={trade.receiver_listing}
          label={`${trade.receiver_name}'s pair`}
        />
      </div>

      {trade.boot_amount_cents > 0 ? (
        <p className="text-sm text-muted-foreground">
          {trade.initiator_name} adds ${(trade.boot_amount_cents / 100).toFixed(0)} boot cash (settle off-platform)
        </p>
      ) : null}

      <div className="flex justify-between gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1 text-center">
            <div
              className={cn(
                'h-1 rounded-full mb-1',
                i <= current ? 'bg-accent' : 'bg-muted'
              )}
            />
            <p className={cn('text-[10px]', i === current ? 'text-accent' : 'text-muted-foreground')}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {trade.status === 'pending' && trade.viewer_side === 'receiver' ? (
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-accent text-accent-foreground rounded-full"
            disabled={acting}
            onClick={() => respond('accept')}
          >
            Accept trade
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-full border-border"
            disabled={acting}
            onClick={() => respond('decline')}
          >
            Decline
          </Button>
        </div>
      ) : null}

      {needsFee ? (
        <Button
          className="w-full min-h-[48px] bg-accent text-accent-foreground font-semibold rounded-full"
          disabled={acting}
          onClick={payFee}
        >
          Pay $4.99 platform fee
        </Button>
      ) : null}

      {waitingOnOther ? (
        <p className="text-xs text-muted-foreground text-center">
          Waiting on {trade.other_party_name}.
          {expiryLabel
            ? ` Trade auto-expires ${expiryLabel} if they don't pay.`
            : ' Trade may auto-expire when the fee window closes.'}
        </p>
      ) : null}

      {canCancel ? (
        <button
          type="button"
          onClick={() => setShowCancelConfirm(true)}
          className="w-full text-xs text-muted-foreground text-center py-2 hover:text-foreground transition-colors"
        >
          Cancel this trade
        </button>
      ) : null}

      {threadId ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Coordinate shipping</h3>
          <MessageThread
            threadId={threadId}
            currentUserId={currentUserId}
            placeholder="Share your shipping address, tracking number…"
            maxHeight="320px"
            showSenderName
          />
        </div>
      ) : null}

      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel this trade?</DialogTitle>
            <DialogDescription>
              Both listings will be reactivated. This can&apos;t be undone.
              {otherPaidFee ? ' The party who already paid will be refunded.' : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="destructive"
              className="rounded-full"
              disabled={acting}
              onClick={() => void cancelTrade()}
            >
              Yes, cancel trade
            </Button>
            <Button
              variant="ghost"
              className="rounded-full"
              disabled={acting}
              onClick={() => setShowCancelConfirm(false)}
            >
              Keep trade
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
