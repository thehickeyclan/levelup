import type { ActivityFeedPost, ActivityTriggerType } from '@/lib/activity-feed/types';

export const MARKET_LISTING_ACTIVITY_TRIGGERS = [
  'market_listing_published',
  'market_collection_listed',
] as const;

export type MarketListingActivityTrigger = (typeof MARKET_LISTING_ACTIVITY_TRIGGERS)[number];

export function isMarketListingActivityPost(
  triggerType: ActivityTriggerType | string
): boolean {
  return (MARKET_LISTING_ACTIVITY_TRIGGERS as readonly string[]).includes(triggerType);
}

export function marketListingHeadlineParts(listingType: string | null | undefined): {
  verb: string;
  tail: string;
} {
  if (listingType === 'collection') return { verb: 'added', tail: 'to collection' };
  if (listingType === 'trade') return { verb: 'listed', tail: 'for trade' };
  return { verb: 'listed', tail: 'for sale' };
}

export function sellerShortDisplayName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  if (!trimmed) return 'Guild member';
  return trimmed.split(' · ')[0]?.trim() || trimmed;
}

function first<T>(row: T | T[] | null | undefined): T | null {
  if (!row) return null;
  return Array.isArray(row) ? row[0] ?? null : row;
}

export function marketListingShoeTitle(post: ActivityFeedPost): string {
  const listing = first(post.market_listings);
  const model = listing?.model?.trim() || listing?.title?.trim() || 'Sneakers';
  const brand = listing?.brand?.trim();
  return brand ? `${brand} ${model}` : model;
}

export function marketListingShoeColorway(post: ActivityFeedPost): string | null {
  return first(post.market_listings)?.colorway?.trim() || null;
}

export function marketListingGroupHeadline(posts: ActivityFeedPost[]): string {
  const seller = sellerShortDisplayName(posts[0]?.seller_display_name);
  if (posts.length === 1) {
    const shoe = marketListingShoeTitle(posts[0]);
    const { verb, tail } = marketListingHeadlineParts(first(posts[0].market_listings)?.listing_type);
    return `${seller} ${verb} ${shoe} ${tail}`;
  }

  const listingTypes = new Set(
    posts.map((post) => first(post.market_listings)?.listing_type ?? 'sell')
  );
  const count = posts.length;
  const pairWord = count === 1 ? 'pair' : 'pairs';

  if (listingTypes.size === 1) {
    const { verb, tail } = marketListingHeadlineParts([...listingTypes][0]);
    return `${seller} ${verb} ${count} ${pairWord} ${tail}`;
  }

  const sneakerWord = count === 1 ? 'sneaker' : 'sneakers';
  return `${seller} listed ${count} ${sneakerWord} on Guild Market`;
}
