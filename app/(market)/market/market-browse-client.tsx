'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketSubNav } from '@/components/market/market-sub-nav';
import { MarketListingCard } from '@/components/market/listing-card';
import {
  BROWSE_BRANDS,
  BROWSE_US_SIZES,
  browseConditionBucket,
  type MarketBrowseListing,
} from '@/lib/market/browse-listings';
import { cn } from '@/lib/utils';

const TYPE_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'buy', label: 'Buy' },
  { id: 'trade', label: 'Trade' },
  { id: 'vault', label: 'Vault' },
  { id: 'collectors', label: 'Collectors' },
] as const;

const CONDITION_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'like_new', label: 'Like new' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
] as const;

type TypeFilter = (typeof TYPE_OPTIONS)[number]['id'];
type ConditionFilter = (typeof CONDITION_OPTIONS)[number]['id'];

export function MarketBrowseClient({
  initialListings,
  collectionListings = [],
  pendingOffers = 0,
}: {
  initialListings: MarketBrowseListing[];
  collectionListings?: MarketBrowseListing[];
  pendingOffers?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const type = (searchParams.get('type') || 'all') as TypeFilter;
  const brand = searchParams.get('brand') || 'all';
  const size = searchParams.get('size') || '';
  const condition = (searchParams.get('condition') || 'all') as ConditionFilter;
  const isCollectors = type === 'collectors';

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === 'all') params.delete(key);
      else params.set(key, value);
      const qs = params.toString();
      router.replace(qs ? `/market?${qs}` : '/market', { scroll: false });
    },
    [router, searchParams]
  );

  const sourceListings = isCollectors ? collectionListings : initialListings;

  const filtered = useMemo(() => {
    return sourceListings.filter((l) => {
      if (!isCollectors) {
        if (type === 'buy' && l.listing_type !== 'sell') return false;
        if (type === 'trade' && l.listing_type !== 'trade') return false;
        if (type === 'vault' && l.listing_type !== 'vault') return false;
      }
      if (brand !== 'all' && l.brand !== brand) return false;
      if (size && Number(l.size) !== Number(size)) return false;
      if (condition !== 'all') {
        const bucket = browseConditionBucket(l.condition, l.wear_state);
        if (bucket !== condition) return false;
      }
      return true;
    });
  }, [sourceListings, type, brand, size, condition, isCollectors]);

  const pillClass = (active: boolean) =>
    cn(
      'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
      active ? 'bg-[#C9A265] text-black' : 'border border-[#333] text-[#666]'
    );

  return (
    <div className="min-h-screen pb-24 bg-black">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">The Guild Market</h1>
            <p className="text-sm text-[#555] mt-0.5">
              {isCollectors
                ? `${collectionListings.length} pair${collectionListings.length !== 1 ? 's' : ''} in collections`
                : `${initialListings.length} pair${initialListings.length !== 1 ? 's' : ''} for sale`}
              {!isCollectors &&
              initialListings.filter((l) => l.listing_type === 'trade' || l.open_to_trade).length > 0
                ? ` · ${initialListings.filter((l) => l.listing_type === 'trade' || l.open_to_trade).length} open to trade`
                : ''}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <MarketSubNav pendingOffers={pendingOffers} />
        </div>
      </div>

      <div className="sticky top-0 z-20 bg-[#111] border-b border-[#1a1a1a]">
        <div className="max-w-4xl mx-auto px-4 py-3 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setParam('type', opt.id)}
                className={pillClass(type === opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setParam('brand', 'all')}
              className={pillClass(brand === 'all')}
            >
              All
            </button>
            {BROWSE_BRANDS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setParam('brand', b)}
                className={pillClass(brand === b)}
              >
                {b}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs text-zinc-500 shrink-0">Size</label>
            <select
              value={size}
              onChange={(e) => setParam('size', e.target.value)}
              className="h-8 rounded-full border border-[#333] bg-[#1a1a1a] text-sm text-zinc-300 px-3 min-w-[5.5rem]"
            >
              <option value="">All</option>
              {BROWSE_US_SIZES.map((s) => (
                <option key={s} value={String(s)}>
                  {Number.isInteger(s) ? s : s.toFixed(1)}
                </option>
              ))}
            </select>

            <div className="flex gap-2 overflow-x-auto flex-1 pb-0.5">
              {CONDITION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setParam('condition', opt.id)}
                  className={pillClass(condition === opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {isCollectors ? (
          <p className="text-xs text-[#555] mb-4">
            Collector showcases — not for sale. Tap a pair to view details.
          </p>
        ) : null}
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-zinc-500">
              {isCollectors
                ? 'No collection pairs yet.'
                : sourceListings.length === 0
                  ? 'No listings yet — be the first to list a pair.'
                  : 'No listings match these filters.'}
            </p>
            <Button
              asChild
              className="mt-4 bg-[#C9A265] text-black font-semibold rounded-full hover:bg-[#C9A265]/90"
            >
              <Link href="/market/listing/new">List a pair</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((listing) => (
              <MarketListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>

      <Link
        href="/market/listing/new"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A265] text-black shadow-lg hover:bg-[#C9A265]/90 transition-colors"
        aria-label="List a pair"
      >
        <Plus className="h-7 w-7" strokeWidth={2.5} />
      </Link>
    </div>
  );
}
