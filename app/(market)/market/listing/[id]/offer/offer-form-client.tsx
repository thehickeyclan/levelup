'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QuickTradeListingSheet } from '@/components/market/quick-trade-listing-sheet';
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

export function OfferFormClient({
  listingId,
  listing,
  myListings,
  defaultTrade,
}: {
  listingId: string;
  listing: OfferListingSummary;
  myListings: OfferListingSummary[];
  defaultTrade: boolean;
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
      router.push(`/market/listing/${listingId}?offered=true`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send offer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref={`/market/listing/${listingId}`} label="Back to listing" />

      <div className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="w-20 h-20 rounded-xl bg-[#1a1a1a] shrink-0 overflow-hidden">
          {listing.imageUrl ? (
            <img src={listing.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{listing.model || listing.title}</p>
          <p className="text-xs text-accent font-medium mt-0.5">{listing.brand}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {listing.modelYear ? `${listing.modelYear} · ` : ''}
            Size {listing.size}
            {listing.conditionLabel ? ` · ${listing.conditionLabel}` : ''}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-300 mb-2">Offer type</p>
        <div className="flex flex-wrap gap-2">
          {OFFER_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setOfferMode(mode.id)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                offerMode === mode.id
                  ? 'bg-[#C9A265] text-black'
                  : 'border border-[#333] text-[#666]'
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
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-zinc-500">
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
                      selected ? 'border-[#C9A265] ring-1 ring-[#C9A265]' : 'border-zinc-800'
                    )}
                  >
                    <div className="aspect-square bg-[#1a1a1a]">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="p-2 bg-zinc-900/60">
                      <p className="text-xs font-medium truncate">{item.model || item.title}</p>
                      <p className="text-[10px] text-muted-foreground">Size {item.size}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setShowQuickList(true)}
            className="w-full border border-dashed border-[#333] rounded-xl py-3 text-sm text-[#555] flex items-center justify-center gap-2 hover:border-[#C9A265] hover:text-[#C9A265] transition-colors"
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

      <div className="rounded-xl border-l-4 border-[#C9A265] bg-accent/5 px-4 py-3 text-sm text-zinc-300">
        $4.99 platform fee per side when offer is accepted. No percentage on offer amount.
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-2 pt-2 bg-gradient-to-t from-black via-black/95 to-transparent">
        <Button
          className="w-full min-h-[48px] bg-[#C9A265] text-black font-semibold rounded-full hover:bg-[#C9A265]/90"
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
