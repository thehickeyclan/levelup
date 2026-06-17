'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { StarRating } from '@/components/star-rating';
import type { MarketSellerReview, MarketSellerStats, MarketSoldHistoryItem } from '@/lib/market/seller-reputation';
import { formatPositiveFeedback, formatSalesCount, sellerTrustLabel } from '@/lib/market/seller-reputation';
import type { SellerProfile } from '@/lib/market/seller';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function SellerProfilePage() {
  const params = useParams();
  const sellerId = params.id as string;
  const [data, setData] = useState<{
    seller: SellerProfile;
    stats: MarketSellerStats;
    soldHistory: MarketSoldHistoryItem[];
    reviews: MarketSellerReview[];
  } | null>(null);

  useEffect(() => {
    fetch(`/api/market/sellers/${sellerId}`)
      .then((r) => r.json())
      .then(setData);
  }, [sellerId]);

  if (!data?.seller) {
    return (
      <div className="px-4 py-8">
        <BackLink fallbackHref="/market" label="Back" />
        <p className="mt-4 text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const { seller, stats, soldHistory, reviews } = data;
  const positive = formatPositiveFeedback(stats.positivePercent, stats.reviewCount);

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market" label="Back to Market" />

      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{seller.displayName}</h1>
        {stats.memberSince ? (
          <p className="text-sm text-muted-foreground">Guild member since {formatDate(stats.memberSince)}</p>
        ) : null}
        <p className="text-sm">{sellerTrustLabel(stats)}</p>
        {stats.reviewCount > 0 ? (
          <StarRating averageRating={stats.averageRating} reviewCount={stats.reviewCount} />
        ) : null}
        {positive ? (
          <p className="text-sm text-accent font-medium">{positive} feedback</p>
        ) : null}
      </div>

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
                  <div className="w-16 h-16 rounded-md bg-white shrink-0 overflow-hidden">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-full h-full object-contain p-1" />
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
