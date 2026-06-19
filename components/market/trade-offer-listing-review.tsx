'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { TradeOfferListingReview } from '@/lib/market/trade-listing-review';
import { cn } from '@/lib/utils';

export function TradeOfferListingReviewCard({
  listing,
  label = 'Offered pair',
  compact = false,
}: {
  listing: TradeOfferListingReview;
  label?: string;
  compact?: boolean;
}) {
  const [activeImage, setActiveImage] = useState(0);
  const displayTitle = listing.model?.trim() || listing.title;
  const specChips = [
    listing.model_year ? String(listing.model_year) : null,
    `Size ${listing.size}`,
    listing.condition_label,
  ].filter(Boolean) as string[];

  const heroUrl = listing.image_urls[activeImage] ?? listing.image_urls[0] ?? null;

  return (
    <div className="rounded-xl border border-border bg-card/80 overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-border/60">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground mt-0.5">{displayTitle}</p>
        <p className="text-xs text-accent">{listing.brand}</p>
      </div>

      {heroUrl ? (
        <div className={cn('bg-muted', compact ? 'aspect-[4/3]' : 'aspect-square')}>
          <img src={heroUrl} alt="" className="w-full h-full object-contain p-2" />
        </div>
      ) : (
        <div className={cn('bg-muted flex items-center justify-center text-xs text-muted-foreground', compact ? 'h-32' : 'h-48')}>
          No photos
        </div>
      )}

      {listing.image_urls.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {listing.image_urls.map((url, i) => (
            <button
              key={url + i}
              type="button"
              onClick={() => setActiveImage(i)}
              className={cn(
                'shrink-0 w-12 h-12 rounded-md border overflow-hidden bg-muted',
                i === activeImage ? 'border-accent ring-1 ring-accent' : 'border-border opacity-80'
              )}
            >
              <img src={url} alt="" className="w-full h-full object-contain p-0.5" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="px-3 py-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {specChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </div>

        {listing.wrestle_score != null || listing.cosmetic_score != null ? (
          <div className="grid grid-cols-2 gap-2">
            {listing.wrestle_score != null ? (
              <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-center">
                <p className="text-base font-bold text-accent">{listing.wrestle_score.toFixed(1)}</p>
                <p className="text-[9px] text-muted-foreground">Wrestle-ready</p>
              </div>
            ) : null}
            {listing.cosmetic_score != null ? (
              <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-center">
                <p className="text-base font-bold text-foreground">{listing.cosmetic_score.toFixed(1)}</p>
                <p className="text-[9px] text-muted-foreground">Appearance</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {listing.condition_summary ? (
          <p className={cn('text-xs text-foreground/80 leading-relaxed', compact && 'line-clamp-2')}>
            {listing.condition_summary}
          </p>
        ) : null}

        {!compact && listing.cosmetic_summary ? (
          <p className="text-xs text-muted-foreground leading-relaxed">{listing.cosmetic_summary}</p>
        ) : null}

        {listing.description ? (
          <p className={cn('text-xs text-muted-foreground whitespace-pre-line leading-relaxed', compact ? 'line-clamp-3' : 'line-clamp-5')}>
            {listing.description}
          </p>
        ) : null}

        <Link
          href={`/market/listing/${listing.id}`}
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium"
        >
          View full listing
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
