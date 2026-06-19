'use client';

import Link from 'next/link';
import { StarRating } from '@/components/star-rating';
import type { MarketSellerStats } from '@/lib/market/seller-reputation';

/** Compact buyer-facing seller row — no discouraging "new seller" copy. */
export function ListingSellerCard({
  sellerId,
  displayName,
  school,
  stats,
}: {
  sellerId: string;
  displayName: string;
  school?: string | null;
  stats: MarketSellerStats;
}) {
  const affiliation = school?.trim() ? `Guild member · ${school.trim()}` : 'Guild member';

  return (
    <Link
      href={`/market/seller/${sellerId}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/80 px-4 py-3 hover:border-accent/40 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{displayName}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{affiliation}</p>
        {stats.reviewCount > 0 ? (
          <div className="mt-2">
            <StarRating averageRating={stats.averageRating} reviewCount={stats.reviewCount} size="sm" />
          </div>
        ) : stats.salesCount > 0 ? (
          <p className="text-xs text-muted-foreground mt-1">{stats.salesCount} sale{stats.salesCount !== 1 ? 's' : ''} on Guild</p>
        ) : null}
      </div>
      <span className="text-xs text-accent shrink-0">View profile</span>
    </Link>
  );
}
