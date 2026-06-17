'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AI_DISCLAIMER } from '@/lib/market/ai/prompts';

type ListingRow = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  price_cents: number | null;
  shipping_cents: number;
  listing_type: string;
  market_listing_images?: { public_url: string; display_order: number }[];
  market_ai_analysis?: { condition_score: number | null } | null;
};

export function MarketBrowseClient() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/market/listings')
      .then((r) => r.json())
      .then((d) => setListings(d.listings ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 pt-6 pb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Guild Market</h1>
          <p className="text-sm text-muted-foreground">Wrestling sneakers · buy, sell, trade</p>
        </div>
        <Button asChild className="bg-accent text-black font-semibold shrink-0">
          <Link href="/market/listing/new">List a pair</Link>
        </Button>
      </div>

      <div className="px-4 mb-4 flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/market/my-listings">My listings</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/market/orders">Orders</Link>
        </Button>
      </div>

      {loading ? (
        <p className="px-4 text-muted-foreground">Loading…</p>
      ) : listings.length === 0 ? (
        <div className="px-4 py-12 text-center text-muted-foreground">
          <p>No listings yet. Be the first to list a pair.</p>
        </div>
      ) : (
        <div className="px-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {listings.map((l) => {
            const imgs = l.market_listing_images ?? [];
            const primary = imgs.sort((a, b) => a.display_order - b.display_order)[0]?.public_url;
            const hasAi = l.market_ai_analysis?.condition_score != null;
            return (
              <Link
                key={l.id}
                href={`/market/listing/${l.id}`}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
              >
                <div className="bg-white aspect-square">
                  {primary ? (
                    <img src={primary} alt="" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">No photo</div>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium line-clamp-2">{l.title}</p>
                  <p className="text-xs text-zinc-400">{l.brand} · Size {l.size}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-accent">
                      {l.price_cents != null ? `$${(l.price_cents / 100).toFixed(0)}` : 'Offers'}
                    </span>
                    {hasAi ? (
                      <span className="text-[10px] uppercase tracking-wide text-accent border border-accent/40 px-1.5 py-0.5 rounded">
                        AI analyzed
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="px-4 mt-8 text-xs text-zinc-500">{AI_DISCLAIMER}</p>
    </div>
  );
}
