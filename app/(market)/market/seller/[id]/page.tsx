'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { StarRating } from '@/components/star-rating';
import { Button } from '@/components/ui/button';
import type { MarketSellerReview, MarketSellerStats, MarketSoldHistoryItem } from '@/lib/market/seller-reputation';
import { formatPositiveFeedback, formatSalesCount, sellerTrustLabel } from '@/lib/market/seller-reputation';
import type { SellerProfile } from '@/lib/market/seller';
import type { SellerInventoryItem } from '@/lib/market/seller-inventory';
import type { CollectionValuation } from '@/lib/market/collection-valuation';
import { cn } from '@/lib/utils';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

type TabId = 'for_sale' | 'trading' | 'collection';

function InventoryGrid({ items, compact }: { items: SellerInventoryItem[]; compact?: boolean }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nothing listed here yet.</p>;
  }
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-2')}>
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/market/listing/${item.id}`}
          className="rounded-lg border border-[#222] overflow-hidden bg-[#1a1a1a] hover:border-[#444] transition-colors"
        >
          <div className={cn('bg-[#111] overflow-hidden', compact ? 'aspect-square' : 'aspect-[4/3]')}>
            {item.primary_image_url ? (
              <img src={item.primary_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600">
                No photo
              </div>
            )}
          </div>
          <div className={cn('p-2', compact ? 'p-1.5' : 'p-2')}>
            <p className={cn('font-medium text-white truncate', compact ? 'text-[10px]' : 'text-xs')}>
              {item.model?.trim() || item.title}
            </p>
            <p className={cn('text-zinc-500 truncate', compact ? 'text-[9px]' : 'text-[10px]')}>
              {item.brand} · Sz {item.size}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function SellerProfilePage() {
  const params = useParams();
  const sellerId = params.id as string;
  const [tab, setTab] = useState<TabId>('for_sale');
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
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

  const load = useCallback(() => {
    fetch(`/api/market/sellers/${sellerId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setFollowing(Boolean(d.following));
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

  if (!data?.seller) {
    return (
      <div className="px-4 py-8">
        <BackLink fallbackHref="/market" label="Back" />
        <p className="mt-4 text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const { seller, stats, soldHistory, reviews, inventory, followerCount, viewer, collectionValuation } = data;
  const positive = formatPositiveFeedback(stats.positivePercent, stats.reviewCount);

  const tabItems: { id: TabId; label: string; count: number }[] = [
    { id: 'for_sale', label: 'For sale', count: inventory.forSale.length },
    { id: 'trading', label: 'Trading', count: inventory.trading.length },
    { id: 'collection', label: 'Collection', count: inventory.collection.length },
  ];

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market" label="Back to Market" />

      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{seller.displayName}</h1>
        {stats.memberSince ? (
          <p className="text-sm text-muted-foreground">Guild member since {formatDate(stats.memberSince)}</p>
        ) : null}
        <p className="text-sm">{sellerTrustLabel(stats)}</p>
        {followerCount > 0 ? (
          <p className="text-sm text-[#888]">
            {followerCount} follower{followerCount !== 1 ? 's' : ''}
          </p>
        ) : null}
        {stats.reviewCount > 0 ? (
          <StarRating averageRating={stats.averageRating} reviewCount={stats.reviewCount} />
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
                ? 'bg-[#C9A265] text-black hover:bg-[#C9A265]/90'
                : 'border-[#333] text-white hover:border-[#555]'
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
                tab === t.id ? 'bg-[#C9A265] text-black' : 'border border-[#333] text-[#666]'
              )}
            >
              {t.label}: {t.count}
            </button>
          ))}
        </div>

        {tab === 'for_sale' ? <InventoryGrid items={inventory.forSale} /> : null}
        {tab === 'trading' ? <InventoryGrid items={inventory.trading} /> : null}
        {tab === 'collection' ? (
          <div className="space-y-2">
            <p className="text-xs text-[#555]">
              {inventory.collection.length} pair{inventory.collection.length !== 1 ? 's' : ''} in collection
            </p>
            {viewer.isOwnProfile && collectionValuation ? (
              <div className="rounded-xl border border-[#222] bg-[#1a1a1a] px-4 py-3">
                <p className="text-sm text-[#888]">Estimated collection value</p>
                <p className="text-2xl font-bold text-[#C9A265] mt-1">
                  ${(collectionValuation.total_cents / 100).toLocaleString()}
                </p>
                <p className="text-[11px] text-[#555] mt-1">
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
        {soldHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed sales yet.</p>
        ) : (
          <ul className="space-y-2">
            {soldHistory.map((item) => (
              <li key={`${item.source}-${item.listingId}`}>
                <Link
                  href={`/market/listing/${item.listingId}`}
                  className="flex gap-3 rounded-lg border border-zinc-800 p-3 hover:border-zinc-600 transition-colors"
                >
                  <div className="w-16 h-16 rounded-md bg-[#1a1a1a] shrink-0 overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2">{item.title || `${item.brand} ${item.model}`}</p>
                    <p className="text-xs text-muted-foreground">
                      Size {item.size}
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
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {stats.salesCount > 0 ? 'No reviews yet.' : 'Feedback appears after completed sales.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-lg border border-zinc-800 p-4 space-y-2">
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
                      <span key={tag} className="text-[10px] uppercase tracking-wide border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400">
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

      <p className="text-xs text-zinc-500">
        {formatSalesCount(stats.salesCount)} on Guild Market. Feedback is from verified buyers after completed orders.
      </p>
    </div>
  );
}
