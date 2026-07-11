'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import {
  activityPostAvatarUrl,
  activityPostCoachAvatarUrl,
  activityPostHeadline,
  activityPostReviewLine,
  activityPostSubline,
  coachDisplayName,
} from '@/lib/activity-feed/display';
import { HAMMER_EMOJI, hammerButtonLabel } from '@/lib/activity-feed/hammer-display';

type Props = {
  post: ActivityFeedPost;
  highlightCoachHammers?: boolean;
};

export function ActivityFeedCard({ post, highlightCoachHammers = false }: Props) {
  const [hammerCount, setHammerCount] = useState(post.hammer_count);
  const [hasHammer, setHasHammer] = useState(post.viewer_has_hammer);
  const [loading, setLoading] = useState(false);

  const avatarUrl = activityPostAvatarUrl(post);
  const coachAvatarUrl = activityPostCoachAvatarUrl(post);
  const headline = activityPostHeadline(post);
  const subline = activityPostSubline(post);
  const reviewLine = activityPostReviewLine(post);
  const isMilestone = post.trigger_type === 'milestone_hit';
  const isPhotoPost = post.trigger_type === 'photo_post';
  const photos = post.photos ?? [];

  const giveHammer = async () => {
    if (hasHammer || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/activity/posts/${post.id}/hammer`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return;
      setHammerCount(data.hammer_count ?? hammerCount + 1);
      setHasHammer(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="rounded-xl border border-border/80 bg-card p-4">
      <div className="flex gap-3">
        <div className="relative h-11 w-11 shrink-0">
          {isMilestone ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <Trophy className="h-5 w-5" aria-hidden />
            </div>
          ) : avatarUrl ? (
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
          {!isMilestone && coachAvatarUrl ? (
            <Image
              src={coachAvatarUrl}
              alt=""
              width={20}
              height={20}
              className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full border-2 border-card object-cover"
              unoptimized
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug">{headline}</p>
          {subline ? (
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{subline}</p>
          ) : null}
          {reviewLine ? (
            <p className="mt-1.5 text-sm text-foreground/90 leading-relaxed">{reviewLine}</p>
          ) : null}
          {post.caption?.trim() && isPhotoPost ? (
            <p className="mt-1.5 text-sm text-foreground/90 leading-relaxed">{post.caption.trim()}</p>
          ) : null}
          {highlightCoachHammers && post.coach_id ? (
            <p className="mt-1 text-xs text-muted-foreground">with {coachDisplayName(post)}</p>
          ) : null}
        </div>
      </div>

      {photos.length > 0 ? (
        <div
          className={`mt-3 grid gap-2 ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
        >
          {photos.map((photo) => (
            <div
              key={photo.storage_path}
              className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border/60 bg-muted"
            >
              <Image
                src={photo.url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 512px) 100vw, 256px"
                unoptimized
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant={hasHammer ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 gap-1.5"
          disabled={hasHammer || loading}
          onClick={giveHammer}
          aria-label={hasHammer ? `You threw a hammer (${hammerCount})` : 'Throw a hammer'}
        >
          <span className="text-base leading-none" aria-hidden>
            {HAMMER_EMOJI}
          </span>
          {hammerButtonLabel(hammerCount)}
        </Button>
      </div>
    </article>
  );
}
