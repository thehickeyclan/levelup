import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityFeedPhoto, ActivityFeedPost } from '@/lib/activity-feed/types';
import { listingImageDisplayUrl, sortListingImages } from '@/lib/market/listing-images';
import { isMarketListingActivityPost } from '@/lib/activity-feed/market-listing-activity';

const BUCKET = 'activity-photos';

export function activityPhotoDisplayUrl(photoId: string): string {
  return `/api/activity/photos/${photoId}/image`;
}

export async function attachActivityPhotoUrls(
  db: SupabaseClient,
  posts: ActivityFeedPost[]
): Promise<ActivityFeedPost[]> {
  const photoPostIds = posts.filter((p) => p.trigger_type === 'photo_post').map((p) => p.id);
  if (photoPostIds.length === 0) return posts;

  const { data: rows, error } = await db
    .from('activity_photos')
    .select('id, post_id, storage_path, display_order')
    .in('post_id', photoPostIds)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('attachActivityPhotoUrls:', error);
    return posts;
  }

  const byPost = new Map<string, ActivityFeedPhoto[]>();
  for (const row of rows ?? []) {
    const pid = row.post_id as string;
    const list = byPost.get(pid) ?? [];
    const id = row.id as string;
    list.push({
      id,
      storage_path: row.storage_path as string,
      display_order: Number(row.display_order ?? 0),
      url: activityPhotoDisplayUrl(id),
    });
    byPost.set(pid, list);
  }

  return posts.map((p) =>
    p.trigger_type === 'photo_post'
      ? { ...p, photos: byPost.get(p.id) ?? [] }
      : p
  );
}

async function attachMarketListingPhotos(
  db: SupabaseClient,
  posts: ActivityFeedPost[]
): Promise<ActivityFeedPost[]> {
  const listingIds = [
    ...new Set(
      posts
        .filter((p) => isMarketListingActivityPost(p.trigger_type) && p.market_listing_id)
        .map((p) => p.market_listing_id as string)
    ),
  ];
  if (listingIds.length === 0) return posts;

  const { data: rows, error } = await db
    .from('market_listing_images')
    .select('id, listing_id, public_url, clean_public_url, use_clean, display_order')
    .in('listing_id', listingIds)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('attachMarketListingPhotos:', error);
    return posts;
  }

  const byListing = new Map<string, ActivityFeedPhoto[]>();
  for (const listingId of listingIds) {
    const images = sortListingImages(
      (rows ?? []).filter((row) => row.listing_id === listingId) as {
        id: string;
        listing_id: string;
        public_url: string;
        clean_public_url?: string | null;
        use_clean?: boolean;
        display_order: number;
      }[]
    );
    byListing.set(
      listingId,
      images.slice(0, 1).map((img) => ({
        id: img.id,
        storage_path: img.public_url,
        display_order: img.display_order,
        url: listingImageDisplayUrl(img),
      }))
    );
  }

  return posts.map((p) =>
    isMarketListingActivityPost(p.trigger_type) && p.market_listing_id
      ? { ...p, photos: byListing.get(p.market_listing_id) ?? [] }
      : p
  );
}

export async function attachFeedPostPhotos(
  db: SupabaseClient,
  posts: ActivityFeedPost[]
): Promise<ActivityFeedPost[]> {
  const withActivity = await attachActivityPhotoUrls(db, posts);
  return attachMarketListingPhotos(db, withActivity);
}
