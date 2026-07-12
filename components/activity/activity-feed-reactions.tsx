'use client';

import { useMemo, useState } from 'react';
import { Loader2, SmilePlus } from 'lucide-react';
import {
  ACTIVITY_REACTION_IDS,
  ACTIVITY_REACTIONS,
  emptyKudosByReaction,
  type ActivityKudosByReaction,
  type ActivityReactionId,
} from '@/lib/activity-feed/kudos-reactions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type Props = {
  postId: string;
  initialByReaction: ActivityKudosByReaction;
  initialViewerReactions: ActivityReactionId[];
};

function ReactionChip({
  reactionId,
  count,
  active,
  loading,
  onToggle,
}: {
  reactionId: ActivityReactionId;
  count: number;
  active: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  const { emoji, ariaLabel } = ACTIVITY_REACTIONS[reactionId];

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={loading}
      onClick={onToggle}
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
}

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
  const [pickerOpen, setPickerOpen] = useState(false);

  const visibleReactionIds = useMemo(
    () =>
      ACTIVITY_REACTION_IDS.filter(
        (id) => (byReaction[id] ?? 0) > 0 || viewerReactions.has(id)
      ),
    [byReaction, viewerReactions]
  );

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

  const pickReaction = (reaction: ActivityReactionId) => {
    void toggle(reaction);
    if (!viewerReactions.has(reaction)) {
      setPickerOpen(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Reactions">
      {visibleReactionIds.map((reactionId) => (
        <ReactionChip
          key={reactionId}
          reactionId={reactionId}
          count={byReaction[reactionId] ?? 0}
          active={viewerReactions.has(reactionId)}
          loading={loadingId === reactionId}
          onToggle={() => void toggle(reactionId)}
        />
      ))}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add a reaction"
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-accent/40 hover:bg-muted/50 hover:text-foreground touch-manipulation"
          >
            <SmilePlus className="h-4 w-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          className="w-auto p-1.5"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-0.5" role="menu" aria-label="Choose a reaction">
            {ACTIVITY_REACTION_IDS.map((reactionId) => {
              const { emoji, ariaLabel } = ACTIVITY_REACTIONS[reactionId];
              const active = viewerReactions.has(reactionId);
              const loading = loadingId === reactionId;

              return (
                <button
                  key={reactionId}
                  type="button"
                  role="menuitem"
                  aria-label={ariaLabel}
                  aria-pressed={active}
                  disabled={loading}
                  onClick={() => pickReaction(reactionId)}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-colors touch-manipulation',
                    active ? 'bg-accent/20' : 'hover:bg-muted',
                    loading && 'opacity-70'
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <span aria-hidden>{emoji}</span>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
