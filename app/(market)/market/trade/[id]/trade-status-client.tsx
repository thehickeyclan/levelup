'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { formatSellerDisplayName } from '@/lib/market/seller';
import { cn } from '@/lib/utils';

export type TradeListingCard = {
  id: string;
  model: string;
  title: string;
  size: number;
  imageUrl: string | null;
};

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
}: {
  trade: TradePageData;
  feePaidBanner: boolean;
}) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const current = stepIndex(trade.status, trade.initiator_fee_paid, trade.receiver_fee_paid);
  const needsFee =
    ['receiver_accepted', 'fees_pending'].includes(trade.status) && !trade.viewer_fee_paid;

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

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6 bg-black">
      <BackLink fallbackHref="/market/offers" label="Back" />

      {feePaidBanner ? (
        <p className="text-sm text-[#C9A265] bg-accent/10 border border-accent/30 rounded-lg p-3">
          Fee payment received — waiting for your trade partner.
        </p>
      ) : null}

      {trade.status === 'completed' ? (
        <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          Trade complete — coordinate shipping directly with your trade partner ({trade.other_party_name}).
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <ListingMini card={trade.initiator_listing} />
        <span className="text-2xl text-zinc-500">⇄</span>
        <ListingMini card={trade.receiver_listing} />
      </div>

      {trade.boot_amount_cents > 0 ? (
        <p className="text-sm text-zinc-400">
          {trade.initiator_name} adds ${(trade.boot_amount_cents / 100).toFixed(0)} cash
        </p>
      ) : null}

      <div className="flex justify-between gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1 text-center">
            <div
              className={cn(
                'h-1 rounded-full mb-1',
                i <= current ? 'bg-[#C9A265]' : 'bg-zinc-800'
              )}
            />
            <p className={cn('text-[10px]', i === current ? 'text-[#C9A265]' : 'text-zinc-600')}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {trade.status === 'pending' && trade.viewer_side === 'receiver' ? (
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-[#C9A265] text-black rounded-full"
            disabled={acting}
            onClick={() => respond('accept')}
          >
            Accept trade
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-full border-zinc-700"
            disabled={acting}
            onClick={() => respond('decline')}
          >
            Decline
          </Button>
        </div>
      ) : null}

      {needsFee ? (
        <Button
          className="w-full min-h-[48px] bg-[#C9A265] text-black font-semibold rounded-full"
          disabled={acting}
          onClick={payFee}
        >
          Pay $4.99 platform fee
        </Button>
      ) : null}
    </div>
  );
}

function ListingMini({ card }: { card: TradeListingCard }) {
  return (
    <div className="flex-1 rounded-xl border border-[#222] bg-[#1a1a1a] p-2 text-center">
      <div className="aspect-square rounded-lg overflow-hidden bg-black mb-2">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : null}
      </div>
      <p className="text-xs font-medium text-white truncate">{card.model || card.title}</p>
      <p className="text-[10px] text-zinc-500">Size {card.size}</p>
    </div>
  );
}
