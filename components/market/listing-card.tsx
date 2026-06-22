'use client';

import Link from 'next/link';
import { Eye, Flame, Sparkles } from 'lucide-react';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import type { MarketBrowseListing } from '@/lib/market/browse-listings';
import { formatListingColorLabel } from '@/lib/market/color-family';
import { RarityBadge } from '@/components/market/rarity-badge';
import { formatMarketShoeSizeDual } from '@/lib/market/listing-sizes';
import { cn } from '@/lib/utils';

function typeBadge(listing: MarketBrowseListing): {
  label: string;
  className: string;
} {
  if (listing.listing_type === 'collection') {
    return { label: 'Collection', className: 'bg-card border border-border text-muted-foreground' };
  }
  if (listing.listing_type === 'vault') {
    return { label: 'OFFERS', className: 'bg-accent/90 text-accent-foreground' };
  }
  if (listing.listing_type === 'trade') {
    return { label: 'Trade', className: 'bg-blue-500/90 text-foreground' };
  }
  if (listing.open_to_trade) {
    return { label: 'Sell + trade', className: 'bg-emerald-600/90 text-foreground' };
  }
  return { label: 'For sale', className: 'bg-emerald-600/90 text-foreground' };
}

function cardCta(listing: MarketBrowseListing): { label: string; solid: boolean } | null {
  if (listing.listing_type === 'collection') return null;
  if (listing.listing_type === 'trade') return { label: 'Trade', solid: false };
  if (listing.listing_type === 'vault') {
    return { label: 'Offer', solid: false };
  }
  if (listing.price_cents == null) {
    return { label: 'Offer', solid: false };
  }
  return { label: 'Buy', solid: true };
}

function priceLabel(listing: MarketBrowseListing): { text: string; className: string } {
  if (listing.listing_type === 'collection') {
    return { text: 'Not for sale', className: 'text-muted-foreground' };
  }
  if (listing.listing_type === 'vault') {
    return { text: 'Offers only', className: 'text-muted-foreground italic text-xs font-normal' };
  }
  if (listing.listing_type === 'trade') {
    return { text: 'Trade only', className: 'text-blue-400' };
  }
  if (listing.price_cents != null) {
    return { text: `$${(listing.price_cents / 100).toFixed(0)}`, className: 'text-accent' };
  }
  return { text: 'Make offer', className: 'text-accent' };
}

export function MarketListingCard({ listing }: { listing: MarketBrowseListing }) {
  const badge = typeBadge(listing);
  const price = priceLabel(listing);
  const cta = cardCta(listing);
  const displayTitle = listing.model?.trim() || listing.title;
  const wearState = (listing.wear_state as 'bnib' | 'new_no_box' | 'used' | null) || 'used';
  const conditionLabel = listingConditionDisplay(wearState, listing.condition);
  const colorLabel = formatListingColorLabel(listing.color_family, listing.colorway);
  const offerCount = listing.pending_offer_count;
  const showOfferCount = offerCount > 0 && listing.listing_type !== 'collection';
  const hotOffers = offerCount >= 2 && listing.listing_type !== 'collection';

  return (
    <Link
      href={`/market/listing/${listing.id}`}
      className="bg-card rounded-xl overflow-hidden border border-border hover:border-border transition-colors flex flex-col group"
    >
      <div className="aspect-[4/5] sm:aspect-square relative overflow-hidden bg-muted">
        {listing.primary_image_url ? (
          <img
            src={listing.primary_image_url}
            alt=""
            className="w-full h-full object-contain p-1.5 group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            No photo
          </div>
        )}
        <span
          className={cn(
            'absolute top-2 left-2 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide',
            listing.listing_type === 'collection' ? 'border' : '',
            badge.className
          )}
        >
          {badge.label}
        </span>
        {hotOffers ? (
          <span className="absolute top-2 right-2 bg-accent text-accent-foreground text-[8px] font-medium px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <Flame className="h-2.5 w-2.5" />
            {offerCount} offers
          </span>
        ) : listing.ai_assisted ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-foreground/75 px-1.5 py-0.5 text-[8px] text-accent">
            <Sparkles className="h-2.5 w-2.5" />
            AI
          </span>
        ) : null}
        {listing.views_count > 0 && listing.listing_type !== 'collection' ? (
          <span className="absolute bottom-2 right-2 bg-foreground/75 backdrop-blur-sm rounded-full px-2 py-1 text-[9px] text-muted-foreground flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {listing.views_count}
          </span>
        ) : null}
      </div>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <p className="text-[9px] font-medium uppercase tracking-wider text-accent">
          {listing.brand}
        </p>
        <p className="text-[13px] font-semibold text-foreground line-clamp-2 leading-snug tracking-tight">
          {displayTitle}
        </p>
        <div className="flex flex-wrap gap-1">
          <span className="text-[9px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
            {formatMarketShoeSizeDual(listing.size)}
          </span>
          <span className="text-[9px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
            {conditionLabel}
          </span>
          {listing.rarity ? (
            <RarityBadge rarity={listing.rarity} className="!text-[8px] !px-1.5 !py-0" />
          ) : null}
          {colorLabel ? (
            <span className="text-[9px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
              {colorLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-auto pt-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p
                className={cn(
                  listing.listing_type === 'vault'
                    ? 'text-xs font-normal italic'
                    : 'text-[13px] font-bold',
                  price.className
                )}
              >
                {price.text}
              </p>
              {listing.listing_type === 'sell' &&
              listing.price_cents != null &&
              listing.accepts_offers ? (
                <p className="text-[10px] text-muted-foreground mt-0.5">or make an offer</p>
              ) : null}
            </div>
            {cta ? (
              <span
                className={cn(
                  'text-[10px] font-medium rounded-full px-2.5 py-1 shrink-0',
                  cta.solid
                    ? 'bg-accent text-accent-foreground'
                    : 'border border-border text-muted-foreground'
                )}
              >
                {cta.label}
              </span>
            ) : null}
          </div>
          {showOfferCount ? (
            <div className="flex items-center gap-1">
              <Flame className="h-2.5 w-2.5 text-accent shrink-0" />
              <span className="text-[10px] text-accent font-medium">
                {offerCount} {offerCount === 1 ? 'offer' : 'offers'}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
