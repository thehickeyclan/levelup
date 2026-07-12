'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  ACTIVITY_REACTION_IDS,
  ACTIVITY_REACTIONS,
  emptyKudosByReaction,
  type ActivityKudosByReaction,
  type ActivityReactionId,
} from '@/lib/activity-feed/kudos-reactions';
import { cn } from '@/lib/utils';

type Props = {
  postId: string;
  initialByReaction: ActivityKudosByReaction;
  initialViewerReactions: ActivityReactionId[];
};

export function ActivityFeedReactions({
  postId,
  initialByReaction,
  initialViewerReactions,
}: Props) {
  const [byReaction, setByReaction] = useState(initialByReaction);
  const [viewerReactions, setViewerReactions] = useState(
    () => new Set<ActivityReactionId>(initialViewerReactions)
  );
  const [loadingId, setLoadingId] = useState<ActivityReactionId | null>(null);

  const toggle = async (reaction: ActivityReactionId) => {
    if (loadingId) return;
    setLoadingId(reaction);

    const had = viewerReactions.has(reaction);
    const prevBy = { ...byReaction };
    const prevViewer = new Set(viewerReactions);

    const nextBy = { ...byReaction };
    if (had) {
      nextBy[reaction] = Math.max(0, nextBy[reaction] - 1);
      const nextViewer = new Set(viewerReactions);
      nextViewer.delete(reaction);
      setByReaction(nextBy);
      setViewerReactions(nextViewer);
    } else {
      nextBy[reaction] += 1;
      const nextViewer = new Set(viewerReactions);
      nextViewer.add(reaction);
      setByReaction(nextBy);
      setViewerReactions(nextViewer);
    }

    try {
      const res = await fetch(`/api/activity/posts/${postId}/kudos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      setByReaction(data.kudos_by_reaction ?? emptyKudosByReaction());
      setViewerReactions(new Set((data.viewer_reactions ?? []) as ActivityReactionId[]));
    } catch {
      setByReaction(prevBy);
      setViewerReactions(prevViewer);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Reactions">
      {ACTIVITY_REACTION_IDS.map((reactionId) => {
        const { emoji, ariaLabel } = ACTIVITY_REACTIONS[reactionId];
        const count = byReaction[reactionId] ?? 0;
        const active = viewerReactions.has(reactionId);
        const loading = loadingId === reactionId;

        return (
          <button
            key={reactionId}
            type="button"
            aria-label={ariaLabel}
            aria-pressed={active}
            disabled={loading}
            onClick={() => void toggle(reactionId)}
            className={cn(
              'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors touch-manipulation',
              active
                ? 'border-accent/50 bg-accent/15 text-foreground'
                : 'border-border bg-background text-foreground hover:border-accent/40 hover:bg-muted/50',
              loading && 'opacity-70'
            )}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <span className="text-base leading-none" aria-hidden>
                {emoji}
              </span>
            )}
            {count > 0 ? (
              <span className="text-xs font-medium tabular-nums leading-none">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
