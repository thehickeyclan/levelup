'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
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

function priceLabel(listing: MarketBrowseListing): { text: string; className: string } {
  if (listing.listing_type === 'vault') {
    return { text: 'Offer only', className: 'text-zinc-500' };
  }
  if (listing.listing_type === 'trade') {
    return { text: 'Trade', className: 'text-zinc-500' };
  }
  if (listing.price_cents != null) {
    return { text: `$${(listing.price_cents / 100).toFixed(0)}`, className: 'text-[#C9A265]' };
  }
  return { text: 'Make offer', className: 'text-[#C9A265]' };
}

export function MarketListingCard({ listing }: { listing: MarketBrowseListing }) {
  const badge = typeBadge(listing);
  const price = priceLabel(listing);
  const displayTitle = listing.model?.trim() || listing.title;
  const wearState = (listing.wear_state as 'bnib' | 'new_no_box' | 'used' | null) || 'used';
  const conditionLabel = listingConditionDisplay(wearState, listing.condition);

  return (
    <Link
      href={`/market/listing/${listing.id}`}
      className="bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#222] hover:border-zinc-600 transition-colors flex flex-col"
    >
      <div className="aspect-square relative overflow-hidden bg-[#1a1a1a]">
        {listing.primary_image_url ? (
          <img
            src={listing.primary_image_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
            No photo
          </div>
        )}
        <span
          className={cn(
            'absolute top-2 left-2 rounded-full px-2 py-0.5 text-[9px] font-semibold',
            badge.className
          )}
        >
          {badge.label}
        </span>
        {listing.ai_assisted ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-[#C9A265]">
            <Sparkles className="h-2.5 w-2.5" />
            AI assisted
          </span>
        ) : null}
      </div>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <span className="text-[10px] font-medium border border-[#C9A265]/50 text-[#C9A265] rounded-full px-2 py-0.5 w-fit">
          {listing.brand}
        </span>
        <p className="text-[13px] font-medium text-white line-clamp-2 leading-snug">{displayTitle}</p>
        <p className="text-[11px] text-zinc-500">
          Size {listing.size} · {conditionLabel}
        </p>
        <p className={cn('text-[13px] font-semibold mt-auto', price.className)}>{price.text}</p>
      </div>
    </Link>
  );
}
