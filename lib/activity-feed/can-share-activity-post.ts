import type { ActivityFeedPost } from '@/lib/activity-feed/types';

/** Whether the feed card should show a Share action for this post. */
export function canShareActivityPost(post: ActivityFeedPost): boolean {
  if (post.trigger_type === 'session_completed') {
    return Boolean(post.session_id);
  }
  if (post.trigger_type === 'milestone_hit') return true;
  if (post.trigger_type === 'photo_post') {
    return (post.photos?.length ?? 0) > 0;
  }
  return false;
}
