'use client';

import Link from 'next/link';
import { StarRating } from '@/components/star-rating';
import type { MarketSellerStats } from '@/lib/market/seller-reputation';
import { formatPositiveFeedback, formatSalesCount } from '@/lib/market/seller-reputation';

export function MarketSellerTrustBadge({
  sellerId,
  displayName,
  stats,
  linkToProfile = true,
}: {
  sellerId: string;
  displayName: string;
  stats: MarketSellerStats;
  linkToProfile?: boolean;
}) {
  const positive = formatPositiveFeedback(stats.positivePercent, stats.reviewCount);
  const inner = (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatSalesCount(stats.salesCount)}
            {positive ? ` · ${positive}` : stats.salesCount > 0 && stats.reviewCount === 0 ? ' · No feedback yet' : ''}
          </p>
        </div>
        {linkToProfile ? (
          <span className="text-xs text-accent shrink-0">View seller</span>
        ) : null}
      </div>
      {stats.reviewCount > 0 ? (
        <StarRating averageRating={stats.averageRating} reviewCount={stats.reviewCount} size="sm" />
      ) : (
        <p className="text-xs text-zinc-500">New seller — be the first to leave feedback after a sale.</p>
      )}
    </div>
  );

  if (!linkToProfile) return inner;

  return (
    <Link href={`/market/seller/${sellerId}`} className="block hover:border-zinc-600 transition-colors">
      {inner}
    </Link>
  );
}
