import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import { ActivityFeedItems } from '@/components/activity/activity-feed-items';

export function ParentHomeActivitySection({ posts }: { posts: ActivityFeedPost[] }) {
  if (posts.length === 0) return null;

  return (
    <section className="px-4 mb-6" aria-label="Family activity">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Family Activity
        </h2>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
          <Link href="/activity?scope=family">See all</Link>
        </Button>
      </div>
      <div className="space-y-3">
        <ActivityFeedItems posts={posts} />
      </div>
    </section>
  );
}
