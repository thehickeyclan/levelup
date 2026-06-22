'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { MessageThread } from '@/components/guild/message-thread';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QuickTradeListingSheet } from '@/components/market/quick-trade-listing-sheet';
import { formatMarketShoeSizeDual } from '@/lib/market/listing-sizes';
import { cn } from '@/lib/utils';

export type OfferMode = 'cash' | 'trade' | 'cash_and_trade';

export type OfferListingSummary = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  conditionLabel: string;
  modelYear?: number | null;
  imageUrl: string | null;
};

const OFFER_MODES: { id: OfferMode; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'trade', label: 'Trade' },
  { id: 'cash_and_trade', label: 'Cash + trade' },
];

export type PendingOfferSummary = {
  id: string;
  offer_type: string;
  amount_cents: number | null;
  status: string;
  thread_id: string | null;
};

export function OfferFormClient({
  listingId,
  listing,
  myListings,
  defaultTrade,
  currentUserId,
  pendingOffer,
  justSent = false,
}: {
  listingId: string;
  listing: OfferListingSummary;
  myListings: OfferListingSummary[];
  defaultTrade: boolean;
  currentUserId: string;
  pendingOffer: PendingOfferSummary | null;
  justSent?: boolean;
}) {
  const router = useRouter();
  const [offerMode, setOfferMode] = useState<OfferMode>(defaultTrade ? 'trade' : 'cash');
  const [amount, setAmount] = useState('');
  const [tradeListingId, setTradeListingId] = useState<string | null>(null);
  const [myTradeListings, setMyTradeListings] = useState(myListings);
  const [showQuickList, setShowQuickList] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const showCash = offerMode === 'cash' || offerMode === 'cash_and_trade';
  const showTrade = offerMode === 'trade' || offerMode === 'cash_and_trade';

  const validation = useMemo(() => {
    const errs: Record<string, string> = {};
    if (showCash) {
      const n = Number(amount);
      if (!amount.trim() || Number.isNaN(n) || n < 1) {
        errs.amount = 'Enter at least $1';
      }
    }
    if (showTrade && !tradeListingId) {
      errs.trade = 'Select a pair from your listings';
    }
    return errs;
  }, [amount, showCash, showTrade, tradeListingId]);

  const canSubmit = !submitting && Object.keys(validation).length === 0;

  const submit = async () => {
    setFieldErrors(validation);
    if (Object.keys(validation).length) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/market/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          offerType: offerMode,
          amountCents: showCash ? Math.round(Number(amount) * 100) : undefined,
          tradeListingId: showTrade ? tradeListingId : undefined,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send offer');
      router.push(`/market/listing/${listingId}/offer?sent=1`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send offer');
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingOffer) {
    const typeLabel =
      pendingOffer.offer_type === 'cash_and_trade'
        ? 'Cash + trade'
        : pendingOffer.offer_type === 'trade'
          ? 'Trade'
          : 'Cash';

    return (
      <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
        <BackLink fallbackHref={`/market/listing/${listingId}`} label="Back to listing" />

        {justSent ? (
          <p className="text-sm text-accent bg-accent/10 border border-accent/30 rounded-xl p-3">
            Offer sent — seller has been notified.
          </p>
        ) : null}

        <div className="rounded-xl border border-border bg-card/80 p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Your offer</p>
          <p className="text-xs text-muted-foreground capitalize">{typeLabel}</p>
          {pendingOffer.amount_cents != null ? (
            <p className="text-2xl font-bold text-accent">
              ${(pendingOffer.amount_cents / 100).toFixed(0)}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground capitalize">Status: {pendingOffer.status}</p>
        </div>

        {pendingOffer.thread_id ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Message seller</h3>
            <MessageThread
              threadId={pendingOffer.thread_id}
              currentUserId={currentUserId}
              placeholder="Reply or follow up on your offer…"
              maxHeight="280px"
              showSenderName
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref={`/market/listing/${listingId}`} label="Back to listing" />

      <div className="flex gap-3 rounded-xl border border-border bg-card/80 p-3">
        <div className="w-20 h-20 rounded-xl bg-card shrink-0 overflow-hidden">
          {listing.imageUrl ? (
            <img src={listing.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{listing.model || listing.title}</p>
          <p className="text-xs text-accent font-medium mt-0.5">{listing.brand}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {listing.modelYear ? `${listing.modelYear} · ` : ''}
            {formatMarketShoeSizeDual(listing.size)}
            {listing.conditionLabel ? ` · ${listing.conditionLabel}` : ''}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground/80 mb-2">Offer type</p>
        <div className="flex flex-wrap gap-2">
          {OFFER_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setOfferMode(mode.id)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                offerMode === mode.id
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-border text-muted-foreground'
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {showCash ? (
        <div>
          <Label htmlFor="offer-amount">Your offer</Label>
          <div className="relative mt-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-muted-foreground">
              $
            </span>
            <Input
              id="offer-amount"
              className="text-center text-2xl font-semibold pl-10 h-14"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
            />
          </div>
          {fieldErrors.amount ? (
            <p className="text-xs text-destructive mt-1">{fieldErrors.amount}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">Minimum $1</p>
          )}
        </div>
      ) : null}

      {showTrade ? (
        <div className="space-y-2">
          <Label>Select a pair from your listings</Label>
          {myTradeListings.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
              {myTradeListings.map((item) => {
                const selected = tradeListingId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTradeListingId(item.id)}
                    className={cn(
                      'shrink-0 w-28 rounded-xl border overflow-hidden text-left transition-colors',
                      selected ? 'border-accent ring-1 ring-accent' : 'border-border'
                    )}
                  >
                    <div className="aspect-square bg-card">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="p-2 bg-card/60">
                      <p className="text-xs font-medium truncate">{item.model || item.title}</p>
                      <p className="text-[10px] text-muted-foreground">{formatMarketShoeSizeDual(item.size)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setShowQuickList(true)}
            className="w-full border border-dashed border-border rounded-xl py-3 text-sm text-muted-foreground flex items-center justify-center gap-2 hover:border-accent hover:text-accent transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add a pair to trade
          </button>
          {fieldErrors.trade ? (
            <p className="text-xs text-destructive">{fieldErrors.trade}</p>
          ) : null}
        </div>
      ) : null}

      <QuickTradeListingSheet
        open={showQuickList}
        onClose={() => setShowQuickList(false)}
        onComplete={(listing) => {
          setMyTradeListings((prev) => [listing, ...prev.filter((l) => l.id !== listing.id)]);
          setTradeListingId(listing.id);
        }}
      />

      <div>
        <Label htmlFor="offer-message">Add a note (optional)</Label>
        <textarea
          id="offer-message"
          className="w-full min-h-[88px] mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
          value={message}
          maxLength={200}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Happy to ship today if accepted."
        />
        <p className="text-xs text-muted-foreground mt-1 text-right">{message.length}/200</p>
      </div>

      <div className="rounded-xl border-l-4 border-accent bg-accent/5 px-4 py-3 text-sm text-foreground/80">
        $4.99 platform fee per side when offer is accepted. No percentage on offer amount.
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-2 pt-2 bg-gradient-to-t from-black via-black/95 to-transparent">
        <Button
          className="w-full min-h-[48px] bg-accent text-accent-foreground font-semibold rounded-full hover:bg-accent/90"
          onClick={submit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Sending…
            </>
          ) : (
            'Send offer'
          )}
        </Button>
      </div>
    </div>
  );
}
