'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { StarRating } from '@/components/star-rating';
import { Button } from '@/components/ui/button';
import type { MarketSellerReview, MarketSellerStats, MarketSoldHistoryItem } from '@/lib/market/seller-reputation';
import { formatPositiveFeedback, formatSalesCount, sellerTrustLabel } from '@/lib/market/seller-reputation';
import type { SellerProfile } from '@/lib/market/seller';
import { sellerCollectionHeading } from '@/lib/market/seller';
import type { SellerInventoryItem } from '@/lib/market/seller-inventory';
import { formatMarketShoeSizeDual } from '@/lib/market/listing-sizes';
import type { CollectionValuation } from '@/lib/market/collection-valuation';
import { sellerListingStatusBadge } from '@/lib/market/listing-type-options';
import { cn } from '@/lib/utils';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

type TabId = 'all' | 'for_sale' | 'trading' | 'collection';

function parseTabParam(value: string | null, allowAll: boolean): TabId {
  if (allowAll && value === 'all') return 'all';
  if (value === 'collection' || value === 'trading' || value === 'for_sale') return value;
  return allowAll ? 'all' : 'for_sale';
}

function InventoryGrid({
  items,
  compact,
  showStatusBadge = false,
}: {
  items: SellerInventoryItem[];
  compact?: boolean;
  showStatusBadge?: boolean;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nothing listed here yet.</p>;
  }
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-2')}>
      {items.map((item) => {
        const badge = showStatusBadge
          ? sellerListingStatusBadge(item.listing_type, 'active')
          : null;
        return (
          <Link
            key={item.id}
            href={`/market/listing/${item.id}`}
            className="rounded-lg border border-border overflow-hidden bg-card hover:border-border transition-colors"
          >
            <div className={cn('relative bg-muted overflow-hidden', compact ? 'aspect-square' : 'aspect-[4/3]')}>
              {item.primary_image_url ? (
                <img src={item.primary_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                  No photo
                </div>
              )}
              {badge ? (
                <span
                  className={cn(
                    'absolute top-1 left-1 text-[8px] border rounded-full px-1.5 py-0.5 bg-background/90 backdrop-blur-sm',
                    badge.className
                  )}
                >
                  {badge.label}
                </span>
              ) : null}
            </div>
            <div className={cn('p-2', compact ? 'p-1.5' : 'p-2')}>
              <p className={cn('font-medium text-foreground truncate', compact ? 'text-[10px]' : 'text-xs')}>
                {item.model?.trim() || item.title}
              </p>
              <p className={cn('text-muted-foreground truncate', compact ? 'text-[9px]' : 'text-[10px]')}>
                {item.brand} · {formatMarketShoeSizeDual(item.size)}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function SellerProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sellerId = params.id as string;
  const [tab, setTab] = useState<TabId>('for_sale');
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<{
    seller: SellerProfile;
    stats: MarketSellerStats;
    soldHistory: MarketSoldHistoryItem[];
    reviews: MarketSellerReview[];
    inventory: { forSale: SellerInventoryItem[]; trading: SellerInventoryItem[]; collection: SellerInventoryItem[] };
    followerCount: number;
    following: boolean;
    viewer: { isOwnProfile: boolean };
    collectionValuation: CollectionValuation | null;
  } | null>(null);

  useEffect(() => {
    if (!data) return;
    const fromUrl = searchParams.get('tab');
    setTab(parseTabParam(fromUrl, data.viewer.isOwnProfile));
  }, [data, searchParams]);

  const load = useCallback(() => {
    setLoadError(null);
    fetch(`/api/market/sellers/${sellerId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setLoadError(d.error || 'Could not load this member profile');
          setData(null);
          return;
        }
        setData(d);
        setFollowing(Boolean(d.following));
      })
      .catch(() => {
        setLoadError('Could not load this member profile');
        setData(null);
      });
  }, [sellerId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!data || data.viewer.isOwnProfile) return;
    setFollowBusy(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      const res = await fetch(`/api/market/sellers/${sellerId}/follow`, {
        method: wasFollowing ? 'DELETE' : 'POST',
      });
      if (!res.ok) {
        setFollowing(wasFollowing);
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              followerCount: Math.max(0, prev.followerCount + (wasFollowing ? -1 : 1)),
              following: !wasFollowing,
            }
          : prev
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setFollowBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="px-4 py-8 max-w-lg mx-auto space-y-4">
        <BackLink fallbackHref="/market" label="Back to Market" />
        <p className="text-sm text-destructive">{loadError}</p>
        <p className="text-xs text-muted-foreground">Member ID: {sellerId}</p>
        <Button type="button" variant="outline" onClick={() => load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data?.seller) {
    return (
      <div className="px-4 py-8">
        <BackLink fallbackHref="/market" label="Back to Market" />
        <p className="mt-4 text-muted-foreground">Loading member profile…</p>
      </div>
    );
  }

  const { seller, stats, soldHistory, reviews, followerCount, viewer, collectionValuation } = data;
  const inventory = data.inventory ?? { forSale: [], trading: [], collection: [] };
  const soldHistorySafe = soldHistory ?? [];
  const reviewsSafe = reviews ?? [];
  const safeStats: MarketSellerStats = stats ?? {
    salesCount: 0,
    reviewCount: 0,
    averageRating: null,
    positivePercent: null,
    memberSince: null,
  };
  const positive = formatPositiveFeedback(safeStats.positivePercent, safeStats.reviewCount);
  const collectionTitle = sellerCollectionHeading(seller.displayName);
  const viewingCollection = tab === 'collection';
  const allPairs = [...inventory.forSale, ...inventory.trading, ...inventory.collection];

  const tabItems: { id: TabId; label: string; count: number }[] = viewer.isOwnProfile
    ? [
        { id: 'all', label: 'All pairs', count: allPairs.length },
        { id: 'for_sale', label: 'For sale', count: inventory.forSale.length },
        { id: 'trading', label: 'Trading', count: inventory.trading.length },
        { id: 'collection', label: 'Showcase', count: inventory.collection.length },
      ]
    : [
        { id: 'for_sale', label: 'For sale', count: inventory.forSale.length },
        { id: 'trading', label: 'Trading', count: inventory.trading.length },
        { id: 'collection', label: 'Collection', count: inventory.collection.length },
      ];

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market" label="Back to Market" />

      <div className="space-y-3">
        <h1 className="text-2xl font-bold">
          {viewingCollection ? collectionTitle : seller.displayName}
        </h1>
        {viewingCollection ? (
          <p className="text-sm text-muted-foreground">
            {seller.displayName}
            {safeStats.memberSince ? ` · Guild member since ${formatDate(safeStats.memberSince)}` : ''}
          </p>
        ) : safeStats.memberSince ? (
          <p className="text-sm text-muted-foreground">
            Guild member since {formatDate(safeStats.memberSince)}
          </p>
        ) : null}
        {followerCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {followerCount} follower{followerCount !== 1 ? 's' : ''}
          </p>
        ) : null}
        <p className="text-sm">{sellerTrustLabel(safeStats)}</p>
        {safeStats.reviewCount > 0 ? (
          <StarRating
            averageRating={safeStats.averageRating}
            reviewCount={safeStats.reviewCount}
          />
        ) : null}
        {positive ? (
          <p className="text-sm text-accent font-medium">{positive} feedback</p>
        ) : null}
        {!viewer.isOwnProfile ? (
          <Button
            type="button"
            variant={following ? 'default' : 'outline'}
            disabled={followBusy}
            onClick={() => void toggleFollow()}
            className={cn(
              'w-full rounded-full font-semibold',
              following
                ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                : 'border-border text-foreground hover:border-border'
            )}
          >
            {following ? 'Following' : 'Follow'}
          </Button>
        ) : null}
      </div>

      <section className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {tabItems.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                tab === t.id ? 'bg-accent text-accent-foreground' : 'border border-border text-muted-foreground'
              )}
            >
              {t.label}: {t.count}
            </button>
          ))}
        </div>

        {tab === 'all' ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Your full closet — pairs stay here whether they&apos;re for sale or showcase only.
            </p>
            {collectionValuation ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-sm text-muted-foreground">Estimated showcase value</p>
                <p className="text-2xl font-bold text-accent mt-1">
                  ${(collectionValuation.total_cents / 100).toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Based on Guild Market comps · showcase pairs only
                  {collectionValuation.pairs_with_estimates < collectionValuation.collection_count
                    ? ` · ${collectionValuation.pairs_with_estimates} of ${collectionValuation.collection_count} pairs estimated`
                    : ''}
                </p>
              </div>
            ) : null}
            <InventoryGrid items={allPairs} showStatusBadge compact />
          </div>
        ) : null}
        {tab === 'for_sale' ? <InventoryGrid items={inventory.forSale} /> : null}
        {tab === 'trading' ? <InventoryGrid items={inventory.trading} /> : null}
        {tab === 'collection' ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Showcase pairs — not for sale
              {inventory.collection.length > 0
                ? ` · ${inventory.collection.length} pair${inventory.collection.length !== 1 ? 's' : ''}`
                : ''}
            </p>
            {viewer.isOwnProfile && collectionValuation ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-sm text-muted-foreground">Estimated collection value</p>
                <p className="text-2xl font-bold text-accent mt-1">
                  ${(collectionValuation.total_cents / 100).toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Based on Guild Market comps
                  {collectionValuation.pairs_with_estimates < collectionValuation.collection_count
                    ? ` · ${collectionValuation.pairs_with_estimates} of ${collectionValuation.collection_count} pairs estimated`
                    : ''}
                  {collectionValuation.updated_at
                    ? ` · Updated ${formatDate(collectionValuation.updated_at)}`
                    : ''}
                </p>
              </div>
            ) : null}
            <InventoryGrid items={inventory.collection} compact />
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sold on Guild Market</h2>
        {soldHistorySafe.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed sales yet.</p>
        ) : (
          <ul className="space-y-2">
            {soldHistorySafe.map((item) => (
              <li key={`${item.source}-${item.listingId}`}>
                <Link
                  href={`/market/listing/${item.listingId}`}
                  className="flex gap-3 rounded-lg border border-border p-3 hover:border-accent/40 transition-colors"
                >
                  <div className="w-16 h-16 rounded-md bg-card shrink-0 overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2">{item.title || `${item.brand} ${item.model}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMarketShoeSizeDual(item.size)}
                      {item.amountCents != null ? ` · $${(item.amountCents / 100).toFixed(0)}` : ''}
                      {' · '}{formatDate(item.soldAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Buyer feedback</h2>
        {reviewsSafe.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {safeStats.salesCount > 0 ? 'No reviews yet.' : 'Feedback appears after completed sales.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {reviewsSafe.map((review) => (
              <li key={review.id} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{review.buyerLabel}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
                </div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${i <= review.rating ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`}
                    />
                  ))}
                </div>
                {review.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {review.tags.map((tag) => (
                      <span key={tag} className="text-[10px] uppercase tracking-wide border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {review.comment ? (
                  <p className="text-sm text-muted-foreground">{review.comment}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {formatSalesCount(safeStats.salesCount)} on Guild Market. Feedback is from verified buyers after completed orders.
      </p>
    </div>
  );
}
