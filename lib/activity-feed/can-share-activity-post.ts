import type { ActivityFeedPost } from '@/lib/activity-feed/types';

/** Whether the feed card should show a Share action for this post. */
export function canShareActivityPost(post: ActivityFeedPost): boolean {
  return post.trigger_type === 'photo_post' && (post.photos?.length ?? 0) > 0;
}
