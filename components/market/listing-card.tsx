'use client';

import Link from 'next/link';
import { Eye, Flame, Sparkles } from 'lucide-react';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import type { MarketBrowseListing } from '@/lib/market/browse-listings';
import { cn } from '@/lib/utils';

function typeBadge(listing: MarketBrowseListing): {
  label: string;
  className: string;
} {
  if (listing.listing_type === 'vault') {
    return { label: 'Vault', className: 'bg-[#C9A265]/90 text-black' };
  }
  if (listing.listing_type === 'trade') {
    return { label: 'Trade', className: 'bg-blue-500/90 text-white' };
  }
  if (listing.open_to_trade) {
    return { label: 'Sell + trade', className: 'bg-emerald-600/90 text-white' };
  }
  return { label: 'For sale', className: 'bg-emerald-600/90 text-white' };
}

function cardCta(listing: MarketBrowseListing): { label: string; solid: boolean } {
  if (listing.listing_type === 'trade') return { label: 'Trade', solid: false };
  if (listing.listing_type === 'vault' || listing.price_cents == null) {
    return { label: 'Offer', solid: false };
  }
  return { label: 'Buy', solid: true };
}

function priceLabel(listing: MarketBrowseListing): { text: string; className: string } {
  if (listing.listing_type === 'vault') {
    if (listing.pending_offer_count > 0) {
      return {
        text: `${listing.pending_offer_count} offer${listing.pending_offer_count !== 1 ? 's' : ''} pending`,
        className: 'text-[#C9A265]',
      };
    }
    return { text: 'Offers only', className: 'text-zinc-500' };
  }
  if (listing.listing_type === 'trade') {
    return { text: 'Trade only', className: 'text-blue-400' };
  }
  if (listing.price_cents != null) {
    return { text: `$${(listing.price_cents / 100).toFixed(0)}`, className: 'text-[#C9A265]' };
  }
  return { text: 'Make offer', className: 'text-[#C9A265]' };
}

export function MarketListingCard({ listing }: { listing: MarketBrowseListing }) {
  const badge = typeBadge(listing);
  const price = priceLabel(listing);
  const cta = cardCta(listing);
  const displayTitle = listing.model?.trim() || listing.title;
  const wearState = (listing.wear_state as 'bnib' | 'new_no_box' | 'used' | null) || 'used';
  const conditionLabel = listingConditionDisplay(wearState, listing.condition);
  const hotOffers = listing.pending_offer_count >= 2;

  return (
    <Link
      href={`/market/listing/${listing.id}`}
      className="bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#222] hover:border-[#444] transition-colors flex flex-col group"
    >
      <div className="aspect-square relative overflow-hidden bg-[#111]">
        {listing.primary_image_url ? (
          <img
            src={listing.primary_image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
            No photo
          </div>
        )}
        <span
          className={cn(
            'absolute top-2 left-2 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide',
            badge.className
          )}
        >
          {badge.label}
        </span>
        {hotOffers ? (
          <span className="absolute top-2 right-2 bg-[#C9A265] text-black text-[8px] font-medium px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <Flame className="h-2.5 w-2.5" />
            {listing.pending_offer_count} offers
          </span>
        ) : listing.ai_assisted ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[8px] text-[#C9A265]">
            <Sparkles className="h-2.5 w-2.5" />
            AI
          </span>
        ) : null}
        {listing.views_count > 0 ? (
          <span className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 text-[9px] text-[#888] flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {listing.views_count}
          </span>
        ) : null}
      </div>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <p className="text-[9px] font-medium uppercase tracking-wider text-[#C9A265]">
          {listing.brand}
        </p>
        <p className="text-[13px] font-semibold text-white line-clamp-2 leading-snug tracking-tight">
          {displayTitle}
        </p>
        <div className="flex flex-wrap gap-1">
          <span className="text-[9px] text-zinc-500 border border-[#333] rounded-full px-1.5 py-0.5">
            Sz {listing.size}
          </span>
          <span className="text-[9px] text-zinc-500 border border-[#333] rounded-full px-1.5 py-0.5">
            {conditionLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <p className={cn('text-[13px] font-bold', price.className)}>{price.text}</p>
          <span
            className={cn(
              'text-[10px] font-medium rounded-full px-2.5 py-1 shrink-0',
              cta.solid
                ? 'bg-[#C9A265] text-black'
                : 'border border-[#444] text-zinc-400'
            )}
          >
            {cta.label}
          </span>
        </div>
      </div>
    </Link>
  );
}
