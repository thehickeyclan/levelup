'use client';

import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import { groupActivityFeedPosts } from '@/lib/activity-feed/group-feed-posts';
import { ActivityFeedCard } from '@/components/activity/activity-feed-card';
import { ActivityFeedMarketGroupCard } from '@/components/activity/activity-feed-market-group-card';

type Props = {
  posts: ActivityFeedPost[];
  highlightCoachHammers?: boolean;
};

export function ActivityFeedItems({ posts, highlightCoachHammers = false }: Props) {
  const items = groupActivityFeedPosts(posts);

  return (
    <>
      {items.map((item) =>
        item.kind === 'market_group' ? (
          <ActivityFeedMarketGroupCard key={`market-group-${item.sellerId}-${item.posts[0].id}`} posts={item.posts} />
        ) : (
          <ActivityFeedCard
            key={item.post.id}
            post={item.post}
            highlightCoachHammers={highlightCoachHammers}
          />
        )
      )}
    </>
  );
}
