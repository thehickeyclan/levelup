import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications';

type ListingMeta = {
  id: string;
  seller_id: string;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
};

export type ListingFollowNotifyEvent =
  | { type: 'listed_for_sale'; priceCents?: number | null }
  | { type: 'vault_open' }
  | { type: 'open_for_trade' }
  | { type: 'collection_showcase' }
  | { type: 'sold' }
  | { type: 'traded' }
  | { type: 'new_offer'; pendingCount?: number }
  | { type: 'price_update'; priceCents: number };

function listingTitle(listing: ListingMeta): string {
  return (
    listing.title?.trim() ||
    [listing.brand, listing.model].filter(Boolean).join(' ') ||
    'A pair you follow'
  );
}

function eventCopy(
  title: string,
  event: ListingFollowNotifyEvent
): { notificationTitle: string; body: string } {
  switch (event.type) {
    case 'listed_for_sale':
      return {
        notificationTitle: 'Now for sale',
        body:
          event.priceCents != null
            ? `${title} is listed for $${(event.priceCents / 100).toFixed(0)}`
            : `${title} is now for sale`,
      };
    case 'vault_open':
      return {
        notificationTitle: 'Now accepting offers',
        body: `${title} is open for offers — no set price`,
      };
    case 'open_for_trade':
      return {
        notificationTitle: 'Open to trade',
        body: `${title} is open for trades`,
      };
    case 'collection_showcase':
      return {
        notificationTitle: 'Back in a collection',
        body: `${title} is back in a collection`,
      };
    case 'sold':
      return {
        notificationTitle: 'Pair sold',
        body: `${title} just sold — tap to see where it landed`,
      };
    case 'traded':
      return {
        notificationTitle: 'Pair traded',
        body: `${title} was traded to a new owner`,
      };
    case 'new_offer':
      return {
        notificationTitle: 'New offer',
        body:
          event.pendingCount && event.pendingCount > 1
            ? `${event.pendingCount} offers on ${title} — someone just bid`
            : `Someone made an offer on ${title}`,
      };
    case 'price_update':
      return {
        notificationTitle: 'Price update',
        body: `${title} is now $${(event.priceCents / 100).toFixed(0)}`,
      };
  }
}

export function detectListingFollowEvents(
  prev: { listing_type: string; status: string; price_cents?: number | null },
  next: { listing_type: string; status: string; price_cents?: number | null }
): ListingFollowNotifyEvent[] {
  const events: ListingFollowNotifyEvent[] = [];

  if (prev.listing_type !== next.listing_type) {
    if (next.listing_type === 'sell') {
      events.push({ type: 'listed_for_sale', priceCents: next.price_cents });
    } else if (next.listing_type === 'vault') {
      events.push({ type: 'vault_open' });
    } else if (next.listing_type === 'trade') {
      events.push({ type: 'open_for_trade' });
    } else if (next.listing_type === 'collection') {
      events.push({ type: 'collection_showcase' });
    }
  }

  if (prev.status !== next.status) {
    if (next.status === 'sold') events.push({ type: 'sold' });
    if (next.status === 'traded') events.push({ type: 'traded' });
  }

  if (
    prev.listing_type === next.listing_type &&
    next.listing_type === 'sell' &&
    next.status === 'active' &&
    prev.price_cents !== next.price_cents &&
    next.price_cents != null &&
    next.price_cents > 0
  ) {
    events.push({ type: 'price_update', priceCents: next.price_cents });
  }

  return events;
}

/**
 * In-app alerts for users following a specific pair (not the seller).
 */
export async function notifyListingFollowers(
  tenantSlug: string,
  listing: ListingMeta,
  event: ListingFollowNotifyEvent,
  opts?: { excludeUserIds?: string[] }
): Promise<number> {
  let sent = 0;
  try {
    const admin = createAdminClient(tenantSlug);
    const { data: follows } = await admin
      .from('market_listing_follows')
      .select('follower_id')
      .eq('listing_id', listing.id);

    if (!follows?.length) return 0;

    const exclude = new Set([listing.seller_id, ...(opts?.excludeUserIds ?? [])]);
    const title = listingTitle(listing);
    const { notificationTitle, body } = eventCopy(title, event);
    const link = `/market/listing/${listing.id}`;

    for (const row of follows) {
      const followerId = row.follower_id as string;
      if (exclude.has(followerId)) continue;

      await createNotification(admin, {
        user_id: followerId,
        type: 'market_listing_follow',
        title: notificationTitle,
        body,
        data: {
          listing_id: listing.id,
          listingId: listing.id,
          link,
          event: event.type,
        },
      });
      sent += 1;
    }
  } catch (e) {
    console.error('notifyListingFollowers:', e);
  }
  return sent;
}
