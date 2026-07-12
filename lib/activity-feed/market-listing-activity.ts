import type { ActivityTriggerType } from '@/lib/activity-feed/types';

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
