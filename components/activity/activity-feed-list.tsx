'use client';

import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import { ActivityFeedCard } from '@/components/activity/activity-feed-card';

export function ActivityFeedList({
  posts,
  highlightCoachKudos = false,
}: {
  posts: ActivityFeedPost[];
  highlightCoachKudos?: boolean;
}) {
  if (posts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No activity yet. Completed sessions will show up here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <ActivityFeedCard key={post.id} post={post} highlightCoachKudos={highlightCoachKudos} />
      ))}
    </div>
  );
}
