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
  activityPostSubline,
  coachDisplayName,
} from '@/lib/activity-feed/display';
import { HAMMER_EMOJI, hammerButtonLabel } from '@/lib/activity-feed/hammer-display';

type Props = {
  post: ActivityFeedPost;
  highlightCoachKudos?: boolean;
};

export function ActivityFeedCard({ post, highlightCoachKudos = false }: Props) {
  const [kudosCount, setKudosCount] = useState(post.kudos_count);
  const [hasKudos, setHasKudos] = useState(post.viewer_has_kudos);
  const [loading, setLoading] = useState(false);

  const avatarUrl = activityPostAvatarUrl(post);
  const coachAvatarUrl = activityPostCoachAvatarUrl(post);
  const headline = activityPostHeadline(post);
  const subline = activityPostSubline(post);
  const isMilestone = post.trigger_type === 'milestone_hit';

  const giveHammer = async () => {
    if (hasKudos || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/activity/posts/${post.id}/kudos`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return;
      setKudosCount(data.kudos_count ?? kudosCount + 1);
      setHasKudos(true);
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
          {highlightCoachKudos && post.coach_id ? (
            <p className="mt-1 text-xs text-muted-foreground">with {coachDisplayName(post)}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant={hasKudos ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 gap-1.5"
          disabled={hasKudos || loading}
          onClick={giveHammer}
          aria-label={hasKudos ? `You gave a hammer (${kudosCount})` : 'Give a hammer'}
        >
          <span className="text-base leading-none" aria-hidden>
            {HAMMER_EMOJI}
          </span>
          {hammerButtonLabel(kudosCount)}
        </Button>
      </div>
    </article>
  );
}
