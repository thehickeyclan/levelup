'use client';

import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';
import { listingConditionDisplay } from '@/lib/market/wear-state';

export type MarketListingCardData = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  wear_state?: 'bnib' | 'new_no_box' | 'used';
  model_year?: number | null;
  price_cents: number | null;
  listing_type: string;
  ai_assisted?: boolean;
  market_listing_images?: { public_url: string; display_order: number }[];
};

export function MarketListingCard({ listing: l }: { listing: MarketListingCardData }) {
  const imgs = l.market_listing_images ?? [];
  const primary = imgs.sort((a, b) => a.display_order - b.display_order)[0]?.public_url;
  const isVault = l.listing_type === 'vault';
  const displayTitle = l.model?.trim() || l.title;
  const conditionLabel = l.wear_state
    ? listingConditionDisplay(l.wear_state, l.condition)
    : l.condition.replace('_', ' ');

  const chips = [
    l.model_year ? String(l.model_year) : null,
    `Size ${l.size}`,
    conditionLabel,
  ].filter(Boolean) as string[];

  return (
    <Link
      href={`/market/listing/${l.id}`}
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden hover:border-zinc-600 transition-colors flex flex-col"
    >
      <div className="bg-[#1a1a1a] aspect-square relative overflow-hidden">
        {primary ? (
          <img src={primary} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">No photo</div>
        )}
        {isVault ? (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/75 border border-accent/40 px-2 py-0.5 text-[10px] text-accent">
            <Lock className="h-3 w-3" />
            Vault
          </span>
        ) : null}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <span className="text-[10px] font-medium border border-accent/40 text-accent rounded-full px-2 py-0.5 w-fit">
          {l.brand}
        </span>
        <p className="text-sm font-semibold line-clamp-2 leading-snug">{displayTitle}</p>
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="bg-zinc-950 border border-zinc-800 rounded-full px-2 py-0.5 text-[10px] text-zinc-500"
            >
              {chip}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <span className="text-sm font-bold text-accent">
            {l.price_cents != null ? `$${(l.price_cents / 100).toFixed(0)}` : 'Make offer'}
          </span>
          {l.ai_assisted ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-500">
              <Sparkles className="h-3 w-3 text-accent" />
              AI
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
