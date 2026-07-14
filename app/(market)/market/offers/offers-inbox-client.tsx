'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { MarketSubNav } from '@/components/market/market-sub-nav';
import { MessageThread } from '@/components/guild/message-thread';
import { TradeOfferListingReviewCard } from '@/components/market/trade-offer-listing-review';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  BuyerOfferRow,
  SellerOfferGroup,
  SellerOfferRow,
} from '@/lib/market/seller-offers-data';

type InboxTab = 'received' | 'sent';

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

function listingLabel(brand: string, model: string, title: string): string {
  return [brand, model].filter(Boolean).join(' ') || title;
}

function OfferRowCard({
  offer,
  acting,
  currentUserId,
  onAccept,
  onDecline,
}: {
  offer: SellerOfferRow;
  acting: boolean;
  currentUserId: string;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const chip = statusChip(offer.status);
  const typeLabel = offerTypeLabel(offer.offer_type);
  const [threadOpen, setThreadOpen] = useState(false);

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

      {(offer.offer_type === 'cash' || offer.offer_type === 'cash_and_trade') && offer.amount_cents ? (
        <p className="text-lg font-bold text-accent">${(offer.amount_cents / 100).toFixed(0)}</p>
      ) : null}

      {offer.trade_listing ? (
        <TradeOfferListingReviewCard
          listing={offer.trade_listing}
          label="Offered in trade"
          compact
        />
      ) : null}

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

      {offer.thread_id ? (
        <>
          <button
            type="button"
            onClick={() => setThreadOpen((v) => !v)}
            className="w-full text-[11px] text-muted-foreground flex items-center justify-center gap-1.5 py-2 border-t border-border"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {threadOpen ? 'Hide messages' : 'Message buyer'}
            {threadOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {threadOpen ? (
            <MessageThread
              threadId={offer.thread_id}
              currentUserId={currentUserId}
              placeholder="Reply or negotiate…"
              maxHeight="240px"
              showSenderName
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SentOfferCard({
  offer,
  currentUserId,
}: {
  offer: BuyerOfferRow;
  currentUserId: string;
}) {
  const chip = statusChip(offer.status);
  const typeLabel = offerTypeLabel(offer.offer_type);
  const title = listingLabel(offer.listing_brand, offer.listing_model, offer.listing_title);
  const [threadOpen, setThreadOpen] = useState(false);
  const checkoutHref =
    offer.status === 'accepted' && offer.checkout_order_id
      ? `/market/listing/${offer.listing_id}/checkout?order=${offer.checkout_order_id}`
      : null;

  return (
    <div className="bg-card rounded-xl p-3 space-y-3 border border-border">
      <div className="flex items-start gap-3">
        {offer.listing_image_url ? (
          <Link
            href={`/market/listing/${offer.listing_id}`}
            className="w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0"
          >
            <img src={offer.listing_image_url} alt="" className="w-full h-full object-cover" />
          </Link>
        ) : (
          <div className="w-14 h-14 rounded-md bg-muted shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/market/listing/${offer.listing_id}`}
                className="text-sm font-medium text-foreground hover:text-accent line-clamp-2"
              >
                {title}
              </Link>
              <p className="text-xs text-muted-foreground mt-0.5">Offer you sent</p>
            </div>
            <span className="text-[10px] border border-border text-muted-foreground rounded-full px-2 py-0.5 shrink-0">
              {typeLabel}
            </span>
          </div>
        </div>
      </div>

      {(offer.offer_type === 'cash' || offer.offer_type === 'cash_and_trade') && offer.amount_cents ? (
        <p className="text-lg font-bold text-accent">${(offer.amount_cents / 100).toFixed(0)}</p>
      ) : null}

      {offer.trade_listing ? (
        <TradeOfferListingReviewCard
          listing={offer.trade_listing}
          label="Your trade pair"
          compact
        />
      ) : null}

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

      {checkoutHref ? (
        <Button asChild size="sm" className="w-full bg-accent text-accent-foreground font-semibold rounded-full">
          <Link href={checkoutHref}>Complete purchase</Link>
        </Button>
      ) : null}

      {offer.status === 'declined' ? (
        <p className="text-xs text-muted-foreground">
          Seller declined this offer.{' '}
          <Link href={`/market/listing/${offer.listing_id}`} className="text-accent hover:underline">
            View listing
          </Link>
        </p>
      ) : null}

      {offer.thread_id ? (
        <>
          <button
            type="button"
            onClick={() => setThreadOpen((v) => !v)}
            className="w-full text-[11px] text-muted-foreground flex items-center justify-center gap-1.5 py-2 border-t border-border"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {threadOpen ? 'Hide messages' : 'Message seller'}
            {threadOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {threadOpen ? (
            <MessageThread
              threadId={offer.thread_id}
              currentUserId={currentUserId}
              placeholder="Follow up on your offer…"
              maxHeight="240px"
              showSenderName
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function OffersInboxClient({
  groups: initialGroups,
  sentOffers: initialSent,
  filterListingId,
  pendingOffers,
  currentUserId,
  messageUnread = 0,
  initialTab,
}: {
  groups: SellerOfferGroup[];
  sentOffers: BuyerOfferRow[];
  filterListingId: string | null;
  pendingOffers: number;
  currentUserId: string;
  messageUnread?: number;
  initialTab?: InboxTab;
}) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxTab>(initialTab ?? 'received');

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

  const receivedOffers = initialGroups.flatMap((g) => g.offers);
  const hasReceived = receivedOffers.length > 0;
  const hasSent = initialSent.length > 0;

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Offers</h1>
        <MarketSubNav pendingOffers={pendingOffers} messageUnread={messageUnread} />

        <div className="flex rounded-full border border-border p-1 bg-muted/40">
          <button
            type="button"
            onClick={() => setTab('received')}
            className={cn(
              'flex-1 rounded-full py-2 text-sm font-medium transition-colors',
              tab === 'received'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Received
            {pendingOffers > 0 ? (
              <span className="ml-1.5 text-[10px] font-bold text-accent">{pendingOffers}</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setTab('sent')}
            className={cn(
              'flex-1 rounded-full py-2 text-sm font-medium transition-colors',
              tab === 'sent'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Sent
            {hasSent ? (
              <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">
                {initialSent.length}
              </span>
            ) : null}
          </button>
        </div>

        {filterListingId && tab === 'received' ? (
          <Link href="/market/offers" className="text-xs text-accent hover:underline">
            Show all listings
          </Link>
        ) : null}

        {tab === 'received' ? (
          !hasReceived ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No offers on your listings yet.
            </p>
          ) : (
            <div className="space-y-6 pb-4">
              {initialGroups.map((group) => (
                <section key={group.listing_id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    {group.listing_image_url ? (
                      <div className="w-8 h-8 rounded-md overflow-hidden bg-muted">
                        <img
                          src={group.listing_image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
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
                        currentUserId={currentUserId}
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
          )
        ) : !hasSent ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            You haven&apos;t sent any offers yet.
          </p>
        ) : (
          <div className="space-y-2 pb-4">
            {initialSent.map((offer) => (
              <SentOfferCard key={offer.id} offer={offer} currentUserId={currentUserId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
