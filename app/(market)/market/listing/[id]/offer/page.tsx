'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import { cn } from '@/lib/utils';

type OfferMode = 'cash' | 'trade' | 'cash_and_trade';

type ListingPreview = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  wear_state?: string;
  model_year?: number | null;
  status: string;
  seller_id: string;
  market_listing_images?: { public_url: string; display_order: number }[];
};

type MyListing = {
  id: string;
  brand: string;
  model: string;
  title: string;
  size: number;
  condition: string;
  wear_state?: string;
  market_listing_images?: { public_url: string; display_order: number }[];
};

const OFFER_MODES: { id: OfferMode; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'trade', label: 'Trade' },
  { id: 'cash_and_trade', label: 'Cash + trade' },
];

export default function ListingOfferPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const listingId = params.id as string;
  const defaultTrade = searchParams.get('trade') === '1';

  const [listing, setListing] = useState<ListingPreview | null>(null);
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [offerMode, setOfferMode] = useState<OfferMode>(defaultTrade ? 'trade' : 'cash');
  const [amount, setAmount] = useState('');
  const [tradeListingId, setTradeListingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [listingRes, meRes] = await Promise.all([
          fetch(`/api/market/listings/${listingId}`),
          fetch(`/api/market/listings?seller=me&status=active&exclude=${listingId}`),
        ]);
        const listingData = await listingRes.json();
        const meData = await meRes.json();

        if (cancelled) return;

        if (!listingRes.ok || !listingData.listing) {
          router.replace(`/market/listing/${listingId}`);
          return;
        }

        const l = listingData.listing as ListingPreview;
        const viewer = listingData.viewer as { isSeller?: boolean } | undefined;
        if (l.status !== 'active' || viewer?.isSeller) {
          router.replace(`/market/listing/${listingId}`);
          return;
        }

        setListing(l);
        setMyListings((meData.listings ?? []) as MyListing[]);
      } catch {
        if (!cancelled) setError('Could not load listing.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, router]);

  const showCash = offerMode === 'cash' || offerMode === 'cash_and_trade';
  const showTrade = offerMode === 'trade' || offerMode === 'cash_and_trade';

  const image = listing?.market_listing_images
    ?.sort((a, b) => a.display_order - b.display_order)[0]?.public_url;

  const conditionLabel = listing?.wear_state
    ? listingConditionDisplay(
        listing.wear_state as 'bnib' | 'new_no_box' | 'used',
        listing.condition
      )
    : listing?.condition?.replace('_', ' ');

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

  const canSubmit = !submitting && !loading && Object.keys(validation).length === 0;

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
      router.push(`/market/listing/${listingId}?offer=sent`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send offer');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
        <BackLink fallbackHref={`/market/listing/${listingId}`} label="Back to listing" />
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref={`/market/listing/${listingId}`} label="Back to listing" />

      {listing ? (
        <div className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="w-20 h-20 rounded-xl bg-[#1a1a1a] shrink-0 overflow-hidden">
            {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : null}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-accent font-medium">{listing.brand}</p>
            <p className="font-semibold truncate">{listing.model || listing.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {listing.model_year ? `${listing.model_year} · ` : ''}
              Size {listing.size}
              {conditionLabel ? ` · ${conditionLabel}` : ''}
            </p>
          </div>
        </div>
      ) : null}

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
                  ? 'bg-accent text-black'
                  : 'border border-zinc-700 text-zinc-500'
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
          {myListings.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-muted-foreground">
              <p>You have no active listings to trade.</p>
              <Link href="/market/listing/new" className="text-accent font-medium mt-2 inline-block">
                List a pair first
              </Link>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
              {myListings.map((item) => {
                const thumb = item.market_listing_images
                  ?.sort((a, b) => a.display_order - b.display_order)[0]?.public_url;
                const selected = tradeListingId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTradeListingId(item.id)}
                    className={cn(
                      'shrink-0 w-28 rounded-xl border overflow-hidden text-left transition-colors',
                      selected ? 'border-accent ring-1 ring-accent' : 'border-zinc-800'
                    )}
                  >
                    <div className="aspect-square bg-[#1a1a1a]">
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
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
          )}
          {fieldErrors.trade ? (
            <p className="text-xs text-destructive">{fieldErrors.trade}</p>
          ) : null}
        </div>
      ) : null}

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

      <div className="rounded-xl border-l-4 border-accent bg-accent/5 px-4 py-3 text-sm text-zinc-300">
        $4.99 platform fee applies to each party if offer is accepted. Cash and trade offers both
        use the flat fee — no percentage on offer amount.
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-2 pt-2 bg-gradient-to-t from-black via-black/95 to-transparent md:static md:bg-none md:p-0 md:pt-2">
        <Button
          className="w-full min-h-[48px] bg-accent text-black font-semibold rounded-full"
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
