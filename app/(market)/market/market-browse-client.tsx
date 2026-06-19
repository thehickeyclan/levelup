'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketSubNav } from '@/components/market/market-sub-nav';
import { MarketListingCard } from '@/components/market/listing-card';
import { MarketFilters } from '@/components/market/market-filters';
import { matchesBrowseConditionFilter, type BrowseConditionFilter } from '@/lib/market/wear-state';
import type { MarketBrowseListing } from '@/lib/market/browse-listings';

type TypeFilter = 'all' | 'buy' | 'trade' | 'vault' | 'collectors';

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
  const color = searchParams.get('color') || 'all';
  const size = searchParams.get('size') || '';
  const rawCondition = searchParams.get('condition') || 'all';
  const conditionMatch: BrowseConditionFilter | 'new' =
    rawCondition === 'bnib' ||
    rawCondition === 'new_no_box' ||
    rawCondition === 'like_new' ||
    rawCondition === 'good' ||
    rawCondition === 'fair' ||
    rawCondition === 'new'
      ? rawCondition
      : 'all';
  const condition: BrowseConditionFilter = conditionMatch === 'new' ? 'all' : conditionMatch;
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const isCollectors = type === 'collectors';
  const hasActiveFilters =
    brand !== 'all' || color !== 'all' || Boolean(size) || conditionMatch !== 'all' || Boolean(minPrice || maxPrice);

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === 'all') params.delete(key);
      else params.set(key, value);
      // Collection pairs have no price — drop stale price filters when switching tabs.
      if (key === 'type' && value === 'collectors') {
        params.delete('minPrice');
        params.delete('maxPrice');
      }
      const qs = params.toString();
      router.replace(qs ? `/market?${qs}` : '/market', { scroll: false });
    },
    [router, searchParams]
  );

  const setPriceRange = useCallback(
    (min?: number, max?: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (min != null) params.set('minPrice', String(min));
      else params.delete('minPrice');
      if (max != null) params.set('maxPrice', String(max));
      else params.delete('maxPrice');
      const qs = params.toString();
      router.replace(qs ? `/market?${qs}` : '/market', { scroll: false });
    },
    [router, searchParams]
  );

  const clearAllFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('brand');
    params.delete('color');
    params.delete('size');
    params.delete('condition');
    params.delete('minPrice');
    params.delete('maxPrice');
    const qs = params.toString();
    router.replace(qs ? `/market?${qs}` : '/market', { scroll: false });
  }, [router, searchParams]);

  const sourceListings = isCollectors ? collectionListings : initialListings;

  const filtered = useMemo(() => {
    const min = minPrice ? Number(minPrice) : undefined;
    const max = maxPrice ? Number(maxPrice) : undefined;

    return sourceListings.filter((l) => {
      if (!isCollectors) {
        if (type === 'buy' && l.listing_type !== 'sell') return false;
        if (type === 'trade' && l.listing_type !== 'trade') return false;
        if (type === 'vault' && l.listing_type !== 'vault') return false;
      }
      if (brand !== 'all' && l.brand !== brand) return false;
      if (color !== 'all' && l.browse_color !== color) return false;
      if (size && Number(l.size) !== Number(size)) return false;
      if (conditionMatch !== 'all' && !matchesBrowseConditionFilter(l.condition, l.wear_state, conditionMatch)) {
        return false;
      }
      if (!isCollectors && (min != null || max != null)) {
        if (l.price_cents == null) return false;
        if (min != null && l.price_cents < min * 100) return false;
        if (max != null && l.price_cents > max * 100) return false;
      }
      return true;
    });
  }, [sourceListings, type, brand, color, size, conditionMatch, minPrice, maxPrice, isCollectors]);

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">The Guild Market</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
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

      <MarketFilters
        type={type}
        brand={brand}
        color={color}
        size={size}
        condition={condition}
        minPrice={minPrice}
        maxPrice={maxPrice}
        setParam={setParam}
        setPriceRange={setPriceRange}
        clearAllFilters={clearAllFilters}
      />

      <div className="max-w-4xl mx-auto px-4 py-4">
        {isCollectors ? (
          <p className="text-xs text-muted-foreground mb-4">
            Collector showcases — not for sale. Tap a pair to view details.
          </p>
        ) : null}
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {isCollectors
                ? collectionListings.length === 0
                  ? 'No collection pairs yet. List a pair as Collection type to showcase it here.'
                  : hasActiveFilters
                    ? 'No collection pairs match these filters.'
                    : 'No collection pairs yet. List a pair as Collection type to showcase it here.'
                : sourceListings.length === 0
                  ? 'No listings yet — be the first to list a pair.'
                  : 'No listings match these filters.'}
            </p>
            <Button
              asChild
              className="mt-4 bg-accent text-accent-foreground font-semibold rounded-full hover:bg-accent/90"
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
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg hover:bg-accent/90 transition-colors"
        aria-label="List a pair"
      >
        <Plus className="h-7 w-7" strokeWidth={2.5} />
      </Link>
    </div>
  );
}
