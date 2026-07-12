import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import { isMarketListingActivityPost } from '@/lib/activity-feed/market-listing-activity';

export type ActivityFeedItem =
  | { kind: 'post'; post: ActivityFeedPost }
  | { kind: 'market_group'; posts: ActivityFeedPost[]; sellerId: string };

function marketSellerId(post: ActivityFeedPost): string | null {
  return post.actor_parent_id?.trim() || null;
}

function canGroupMarketPosts(a: ActivityFeedPost, b: ActivityFeedPost): boolean {
  if (!isMarketListingActivityPost(a.trigger_type) || !isMarketListingActivityPost(b.trigger_type)) {
    return false;
  }
  const sellerA = marketSellerId(a);
  const sellerB = marketSellerId(b);
  return Boolean(sellerA && sellerB && sellerA === sellerB);
}

/** Merge adjacent market listing posts from the same seller into one feed item. */
export function groupActivityFeedPosts(posts: ActivityFeedPost[]): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];

  for (const post of posts) {
    const last = items[items.length - 1];
    if (last?.kind === 'market_group' && canGroupMarketPosts(last.posts[0], post)) {
      last.posts.push(post);
      continue;
    }

    if (isMarketListingActivityPost(post.trigger_type) && marketSellerId(post)) {
      items.push({ kind: 'market_group', posts: [post], sellerId: marketSellerId(post)! });
      continue;
    }

    items.push({ kind: 'post', post });
  }

  return items.map((item) => {
    if (item.kind === 'market_group' && item.posts.length === 1) {
      return { kind: 'post' as const, post: item.posts[0] };
    }
    return item;
  });
}
