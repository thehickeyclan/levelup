'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SELLER_LISTING_TYPE_OPTIONS,
  sellerListingTypeLabel,
  type MarketListingType,
} from '@/lib/market/listing-type-options';
import { cn } from '@/lib/utils';

export type ListingTypePatch = {
  listing_type: MarketListingType;
  price_cents: number | null;
  shipping_cents?: number;
  open_to_trade?: boolean;
};

function patchForType(type: MarketListingType, priceDollars?: string): ListingTypePatch {
  switch (type) {
    case 'sell': {
      const dollars = Number(priceDollars || 0);
      return {
        listing_type: 'sell',
        price_cents: Math.round(dollars * 100),
        shipping_cents: 1000,
        open_to_trade: false,
      };
    }
    case 'trade':
      return { listing_type: 'trade', price_cents: null, open_to_trade: false };
    case 'collection':
      return {
        listing_type: 'collection',
        price_cents: null,
        open_to_trade: false,
        shipping_cents: 0,
      };
  }
}

export function ListingTypeQuickActions({
  listingId,
  currentType,
  currentPriceCents,
  onUpdated,
  compact = false,
  title,
  modeBlockedReason = null,
  activeTradeId = null,
}: {
  listingId: string;
  currentType: MarketListingType;
  currentPriceCents?: number | null;
  onUpdated?: (patch: ListingTypePatch) => void;
  compact?: boolean;
  title?: string;
  modeBlockedReason?: string | null;
  activeTradeId?: string | null;
}) {
  const [acting, setActing] = useState<MarketListingType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sellMode, setSellMode] = useState(false);
  const [price, setPrice] = useState(
    currentPriceCents != null ? String(Math.round(currentPriceCents / 100)) : ''
  );

  const modeBlocked = Boolean(modeBlockedReason);

  const applyType = async (type: MarketListingType, priceDollars?: string) => {
    if (modeBlocked && type !== currentType) return;
    if (type === currentType && type !== 'sell') return;
    if (type === 'sell' && !priceDollars?.trim()) {
      setSellMode(true);
      setError(null);
      return;
    }
    if (type === 'sell') {
      const n = Number(priceDollars);
      if (!Number.isFinite(n) || n <= 0) {
        setError('Enter a price to list for sale.');
        return;
      }
    }

    setActing(type);
    setError(null);
    try {
      const body = patchForType(type, priceDollars);
      const res = await fetch(`/api/market/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.active_trade_id) {
          throw new Error(
            `${data.error || 'Cannot change listing mode right now.'} Open the trade to cancel or wait for it to finish.`
          );
        }
        throw new Error(data.error || 'Could not update listing');
      }

      setSellMode(false);
      onUpdated?.(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setActing(null);
    }
  };

  const heading =
    title ??
    (currentType === 'collection'
      ? 'Ready to list this pair for sale?'
      : currentType === 'sell'
        ? 'Still in your collection — change how buyers see this pair'
        : 'Change how this pair is listed');

  const blockedNote = modeBlockedReason ? (
    <p className="text-[10px] text-muted-foreground leading-snug">
      {modeBlockedReason}
      {activeTradeId ? (
        <>
          {' '}
          <Link href={`/market/trade/${activeTradeId}`} className="text-accent hover:underline">
            View trade
          </Link>
        </>
      ) : modeBlockedReason.includes('pending offer') ? (
        <>
          {' '}
          <Link href={`/market/offers?listing=${listingId}`} className="text-accent hover:underline">
            Review offers
          </Link>
        </>
      ) : null}
    </p>
  ) : null;

  if (compact) {
    return (
      <div className="space-y-2 mt-2 pt-2 border-t border-border/60" onClick={(e) => e.preventDefault()}>
        <p className="text-xs text-muted-foreground">
          {currentType === 'collection' ? (
            <>
              In your collection — tap <span className="text-foreground font-medium">For sale</span> when you&apos;re ready
            </>
          ) : (
            <>
              Listed as{' '}
              <span className="text-foreground font-medium">{sellerListingTypeLabel(currentType)}</span>
              {' — tap Collection to pull back from the market'}
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(['sell', 'trade', 'collection'] as const).map((type) => {
            const opt = SELLER_LISTING_TYPE_OPTIONS.find((o) => o.value === type)!;
            const shortLabel =
              type === 'collection'
                ? currentType === 'collection'
                  ? 'Collection'
                  : 'Back to collection'
                : type === 'sell'
                  ? 'For sale'
                  : opt.label;
            const isCurrent = currentType === type;
            const disabled = Boolean(acting) || (modeBlocked && !isCurrent);
            return (
              <button
                key={type}
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  void applyType(type, type === 'sell' ? price : undefined);
                }}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[10px] font-medium border transition-colors',
                  isCurrent
                    ? 'border-accent bg-accent/15 text-accent'
                    : disabled
                      ? 'border-border/50 text-muted-foreground/50 cursor-not-allowed'
                      : 'border-border text-muted-foreground hover:border-accent/50 hover:text-accent'
                )}
              >
                {acting === type ? (
                  <Loader2 className="h-3 w-3 animate-spin inline" />
                ) : (
                  shortLabel
                )}
              </button>
            );
          })}
        </div>
        {sellMode || (currentType === 'sell' && !price) ? (
          <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Asking price $"
              className="h-9 text-sm flex-1"
              inputMode="decimal"
            />
            <Button
              type="button"
              size="sm"
              className="h-9 bg-accent text-accent-foreground shrink-0"
              disabled={acting === 'sell'}
              onClick={(e) => {
                e.stopPropagation();
                void applyType('sell', price);
              }}
            >
              {acting === 'sell' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'List'}
            </Button>
          </div>
        ) : currentType === 'sell' && price ? (
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setSellMode(true);
            }}
          >
            Change price (${price})
          </button>
        ) : null}
        {blockedNote}
        {error ? <p className="text-[10px] text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{heading}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Currently: <span className="text-accent">{sellerListingTypeLabel(currentType)}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SELLER_LISTING_TYPE_OPTIONS.map((opt) => {
          const isCurrent = currentType === opt.value;
          const busy = acting === opt.value;
          const disabled = Boolean(acting) || (modeBlocked && !isCurrent);
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => void applyType(opt.value, opt.value === 'sell' ? price : undefined)}
              className={cn(
                'text-left rounded-lg border px-3 py-2.5 transition-colors',
                isCurrent
                  ? 'border-accent bg-accent/15'
                  : disabled
                    ? 'border-border/50 bg-muted/30 cursor-not-allowed'
                    : 'border-border bg-card hover:border-accent/40'
              )}
            >
              <p className="text-sm font-medium flex items-center gap-1.5">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : null}
                {opt.label}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{opt.hint}</p>
            </button>
          );
        })}
      </div>

      {(sellMode || currentType === 'sell') && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Asking price ($)</label>
          <div className="flex gap-2">
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="e.g. 120"
              inputMode="decimal"
            />
            <Button
              type="button"
              className="bg-accent text-accent-foreground shrink-0"
              disabled={acting === 'sell'}
              onClick={() => void applyType('sell', price)}
            >
              {acting === 'sell' ? 'Saving…' : 'List for sale'}
            </Button>
          </div>
        </div>
      )}

      {blockedNote ? <div className="text-xs text-muted-foreground">{blockedNote}</div> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
