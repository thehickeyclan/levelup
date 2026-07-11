import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityFeedPhoto, ActivityFeedPost } from '@/lib/activity-feed/types';

const BUCKET = 'activity-photos';

export function activityPhotoPublicUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return '';
  return `${base}/storage/v1/object/public/${BUCKET}/${storagePath}`;
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
    list.push({
      id: row.id as string,
      storage_path: row.storage_path as string,
      display_order: Number(row.display_order ?? 0),
      url: activityPhotoPublicUrl(row.storage_path as string),
    });
    byPost.set(pid, list);
  }

  return posts.map((p) =>
    p.trigger_type === 'photo_post'
      ? { ...p, photos: byPost.get(p.id) ?? [] }
      : p
  );
}
