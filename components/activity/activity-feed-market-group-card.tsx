'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import {
  marketListingGroupHeadline,
  marketListingShoeColorway,
  marketListingShoeTitle,
} from '@/lib/activity-feed/market-listing-activity';
import { activityPostAvatarUrl } from '@/lib/activity-feed/display';
import { ActivityFeedReactions } from '@/components/activity/activity-feed-reactions';

type Props = {
  posts: ActivityFeedPost[];
};

export function ActivityFeedMarketGroupCard({ posts }: Props) {
  const lead = posts[0];
  const avatarUrl = activityPostAvatarUrl(lead);
  const headline = marketListingGroupHeadline(posts);

  return (
    <article className="rounded-xl border border-border/80 bg-card p-4">
      <div className="flex gap-3">
        <div className="relative h-11 w-11 shrink-0">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              {headline.charAt(0)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug">{headline}</p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">Guild Market</p>
        </div>
      </div>

      <div
        className={`mt-3 grid gap-3 ${
          posts.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'
        }`}
      >
        {posts.map((post) => {
          const listingHref = post.market_listing_id
            ? `/market/listing/${post.market_listing_id}`
            : null;
          const photo = post.photos?.[0];
          const shoeTitle = marketListingShoeTitle(post);
          const colorway = marketListingShoeColorway(post);

          return (
            <div key={post.id} className="min-w-0">
              {photo && listingHref ? (
                <Link
                  href={listingHref}
                  className="relative block aspect-[4/3] overflow-hidden rounded-lg border border-border/60 bg-muted touch-manipulation"
                  aria-label={`View ${shoeTitle}`}
                >
                  <Image
                    src={photo.url}
                    alt=""
                    fill
                    className="object-cover transition-opacity hover:opacity-95"
                    sizes="(max-width: 640px) 50vw, 180px"
                    unoptimized
                  />
                </Link>
              ) : (
                <div className="aspect-[4/3] rounded-lg border border-border/60 bg-muted" />
              )}
              <div className="mt-1.5 min-w-0">
                {listingHref ? (
                  <Link
                    href={listingHref}
                    className="block text-xs font-medium text-foreground hover:text-accent leading-snug"
                  >
                    {shoeTitle}
                  </Link>
                ) : (
                  <p className="text-xs font-medium text-foreground leading-snug">{shoeTitle}</p>
                )}
                {colorway ? (
                  <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{colorway}</p>
                ) : null}
              </div>
              <div className="mt-2">
                <ActivityFeedReactions
                  postId={post.id}
                  initialByReaction={post.kudos_by_reaction}
                  initialViewerReactions={post.viewer_reactions}
                />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
