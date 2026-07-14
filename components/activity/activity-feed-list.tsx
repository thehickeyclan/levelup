'use client';

import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import { ActivityFeedItems } from '@/components/activity/activity-feed-items';

export function ActivityFeedList({
  posts,
  highlightCoachHammers = false,
}: {
  posts: ActivityFeedPost[];
  highlightCoachHammers?: boolean;
}) {
  if (posts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No activity yet. Booked sessions will show up here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ActivityFeedItems posts={posts} highlightCoachHammers={highlightCoachHammers} />
    </div>
  );
}
