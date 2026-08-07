'use client';

import Link from 'next/link';
import { Layers } from 'lucide-react';
import type { MarketCollectorBrowse } from '@/lib/market/collector-browse';
import { RarityBadge } from '@/components/market/rarity-badge';
import { cn } from '@/lib/utils';

function PreviewCollage({ urls }: { urls: string[] }) {
  if (!urls.length) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs">
        No photos yet
      </div>
    );
  }

  if (urls.length === 1) {
    return (
      <img src={urls[0]} alt="" className="w-full h-full object-contain p-2" />
    );
  }

  return (
    <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5 bg-muted">
      {urls.slice(0, 4).map((url, i) => (
        <div key={`${url}-${i}`} className="relative overflow-hidden bg-muted flex items-center justify-center p-0.5">
          <img src={url} alt="" className="w-full h-full object-contain" />
        </div>
      ))}
      {urls.length < 4
        ? Array.from({ length: 4 - urls.length }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-muted" />
          ))
        : null}
    </div>
  );
}

export function CollectorCard({
  collector,
  showMatchingCount,
  totalPairCount,
}: {
  collector: MarketCollectorBrowse;
  showMatchingCount?: boolean;
  totalPairCount?: number;
}) {
  const href = `/market/seller/${collector.seller_id}?tab=collection`;
  const nameSegment = collector.display_name.split(' · ')[0]?.trim() || collector.display_name;
  const pairLabel =
    showMatchingCount && totalPairCount != null && collector.pair_count < totalPairCount
      ? `${collector.pair_count} of ${totalPairCount} pairs match`
      : `${collector.pair_count} pair${collector.pair_count !== 1 ? 's' : ''}`;

  return (
    <Link
      href={href}
      className="bg-card rounded-xl overflow-hidden border border-border/90 shadow-sm hover:shadow-md hover:border-accent/40 transition-all flex flex-col group"
    >
      <div className="aspect-[4/5] sm:aspect-square relative overflow-hidden bg-muted">
        <PreviewCollage urls={collector.preview_image_urls} />
        <span className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-background/90 border border-border text-muted-foreground backdrop-blur-sm">
          Collection
        </span>
        {collector.top_rarity ? (
          <span className="absolute top-2 right-2">
            <RarityBadge rarity={collector.top_rarity} className="!text-[8px] !px-1.5 !py-0.5" />
          </span>
        ) : null}
      </div>
      <div className="p-3 flex gap-3 items-start">
        <div
          className={cn(
            'shrink-0 rounded-full overflow-hidden bg-muted border border-border',
            collector.photo_url ? 'h-10 w-10' : 'h-10 w-10 flex items-center justify-center'
          )}
        >
          {collector.photo_url ? (
            <img src={collector.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-semibold text-muted-foreground">{nameSegment.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground truncate group-hover:text-accent transition-colors">
            {nameSegment}
          </p>
          {collector.school ? (
            <p className="text-[10px] text-muted-foreground truncate">{collector.school}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Layers className="h-3 w-3 shrink-0" />
              {pairLabel}
            </span>
            {collector.grail_count > 0 ? (
              <span className="text-[10px] text-accent font-medium">
                {collector.grail_count} standout{collector.grail_count !== 1 ? 's' : ''}
              </span>
            ) : collector.rare_count > 0 ? (
              <span className="text-[10px] text-amber-400 font-medium">
                {collector.rare_count} highlighted
              </span>
            ) : null}
            {collector.estimated_value_cents != null && collector.estimated_value_cents > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                ~${(collector.estimated_value_cents / 100).toLocaleString()} est.
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
