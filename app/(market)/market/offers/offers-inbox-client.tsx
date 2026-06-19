'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { MarketSubNav } from '@/components/market/market-sub-nav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SellerOfferGroup, SellerOfferRow } from '@/lib/market/seller-offers-data';

function offerTypeLabel(type: string): string {
  if (type === 'cash_and_trade') return 'Cash + trade';
  if (type === 'trade') return 'Trade';
  return 'Cash';
}

function statusChip(status: string): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', className: 'text-amber-400 border-amber-500/40' };
    case 'accepted':
      return { label: 'Accepted', className: 'text-emerald-400 border-emerald-500/40' };
    case 'declined':
      return { label: 'Declined', className: 'text-muted-foreground border-border' };
    case 'expired':
      return { label: 'Expired', className: 'text-muted-foreground border-border' };
    default:
      return { label: status, className: 'text-muted-foreground border-border' };
  }
}

function OfferRowCard({
  offer,
  acting,
  onAccept,
  onDecline,
}: {
  offer: SellerOfferRow;
  acting: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const chip = statusChip(offer.status);
  const typeLabel = offerTypeLabel(offer.offer_type);

  return (
    <div className="bg-card rounded-xl p-3 space-y-3 border border-border">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{offer.buyer_label}</p>
          <p className="text-xs text-muted-foreground">Guild member</p>
        </div>
        <span className="text-[10px] border border-border text-muted-foreground rounded-full px-2 py-0.5">
          {typeLabel}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {(offer.offer_type === 'cash' || offer.offer_type === 'cash_and_trade') && offer.amount_cents ? (
          <p className="text-lg font-bold text-accent">${(offer.amount_cents / 100).toFixed(0)}</p>
        ) : null}
        {offer.trade_listing ? (
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted">
              {offer.trade_listing.primary_image_url ? (
                <img
                  src={offer.trade_listing.primary_image_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {offer.trade_listing.model || offer.trade_listing.title} · Size {offer.trade_listing.size}
            </p>
          </div>
        ) : null}
      </div>

      {offer.message ? (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">{offer.message}</p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(offer.created_at), { addSuffix: true })}
        </span>
        <span className={cn('text-[10px] border rounded-full px-2 py-0.5', chip.className)}>
          {chip.label}
        </span>
      </div>

      {offer.status === 'pending' && onAccept && onDecline ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-accent text-accent-foreground font-semibold rounded-full"
            disabled={acting}
            onClick={onAccept}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 rounded-full border-border"
            disabled={acting}
            onClick={onDecline}
          >
            Decline
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function OffersInboxClient({
  groups,
  filterListingId,
  pendingOffers,
}: {
  groups: SellerOfferGroup[];
  filterListingId: string | null;
  pendingOffers: number;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);

  const respond = async (offerId: string, action: 'accept' | 'decline') => {
    setActing(offerId);
    try {
      const res = await fetch(`/api/market/offers/${offerId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (action === 'accept' && data.redirectUrl) {
        router.push(data.redirectUrl);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(null);
    }
  };

  const allOffers = groups.flatMap((g) => g.offers);
  const hasOffers = allOffers.length > 0;

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Offers</h1>
        <MarketSubNav pendingOffers={pendingOffers} />

        {filterListingId ? (
          <Link
            href="/market/offers"
            className="text-xs text-accent hover:underline"
          >
            Show all listings
          </Link>
        ) : null}

        {!hasOffers ? (
          <p className="text-sm text-muted-foreground py-8">No offers yet.</p>
        ) : (
          <div className="space-y-6 pb-4">
            {groups.map((group) => (
              <section key={group.listing_id} className="space-y-3">
                <div className="flex items-center gap-2">
                  {group.listing_image_url ? (
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-muted">
                      <img src={group.listing_image_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : null}
                  <p className="text-sm font-medium text-foreground/80">{group.listing_title}</p>
                </div>
                <div className="space-y-2">
                  {group.offers.map((offer) => (
                    <OfferRowCard
                      key={offer.id}
                      offer={offer}
                      acting={acting === offer.id}
                      onAccept={
                        offer.status === 'pending'
                          ? () => respond(offer.id, 'accept')
                          : undefined
                      }
                      onDecline={
                        offer.status === 'pending'
                          ? () => respond(offer.id, 'decline')
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
