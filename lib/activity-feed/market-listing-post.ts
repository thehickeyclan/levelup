import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSellerPublicMetaBatch } from '@/lib/market/seller';
import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import { isMarketListingActivityPost } from '@/lib/activity-feed/market-listing-activity';

function isDuplicateKeyError(message: string): boolean {
  return message.includes('duplicate') || message.includes('unique');
}

const PUBLISHABLE_LISTING_TYPES = new Set(['collection', 'sell', 'trade']);

/** One activity card when a market listing goes live with photos. */
export async function createMarketListingActivityPost(
  admin: SupabaseClient,
  listingId: string
): Promise<void> {
  const { data: listing, error: listingErr } = await admin
    .from('market_listings')
    .select('id, seller_id, brand, model, listing_type, status')
    .eq('id', listingId)
    .maybeSingle();

  if (listingErr || !listing) {
    if (listingErr) console.error('market_listing_published lookup:', listingErr);
    return;
  }

  const listingType = listing.listing_type as string;
  if (!PUBLISHABLE_LISTING_TYPES.has(listingType) || listing.status !== 'active') return;

  const { count: imageCount } = await admin
    .from('market_listing_images')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId);

  if (!imageCount) return;

  const sellerId = listing.seller_id as string;

  const { data: wrestler } = await admin
    .from('youth_wrestlers')
    .select('id, profile_public')
    .eq('parent_id', sellerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const isPublic = wrestler?.profile_public !== false;

  const { error } = await admin.from('activity_posts').insert({
    trigger_type: 'market_listing_published',
    actor_parent_id: sellerId,
    youth_wrestler_id: (wrestler?.id as string | undefined) ?? null,
    market_listing_id: listingId,
    is_public: isPublic,
    parent_approved: true,
  });

  if (error && !isDuplicateKeyError(error.message)) {
    console.error('market_listing_published insert:', error);
  }
}

export async function attachMarketListingFeedMeta(
  tenantSlug: string,
  posts: ActivityFeedPost[]
): Promise<ActivityFeedPost[]> {
  const marketPosts = posts.filter((p) => isMarketListingActivityPost(p.trigger_type));
  if (marketPosts.length === 0) return posts;

  const sellerIds = [
    ...new Set(
      marketPosts
        .map((p) => (p as ActivityFeedPost & { actor_parent_id?: string }).actor_parent_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const sellerMeta = await fetchSellerPublicMetaBatch(tenantSlug, sellerIds);

  return posts.map((post) => {
    if (!isMarketListingActivityPost(post.trigger_type)) return post;
    const sellerId = post.actor_parent_id;
    if (!sellerId) return post;
    const meta = sellerMeta.get(sellerId);
    if (!meta) return post;
    return {
      ...post,
      seller_display_name: meta.displayName,
      seller_photo_url: meta.photoUrl,
    };
  });
}
