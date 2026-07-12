'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Check, Loader2, Share2, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canShareActivityPost } from '@/lib/activity-feed/can-share-activity-post';
import { shareActivityPost } from '@/lib/activity-feed/share-post-client';
import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import {
  activityPostAvatarUrl,
  activityPostCoachAvatarUrl,
  activityPostHeadline,
  activityPostReviewLine,
  activityPostSubline,
  coachDisplayName,
} from '@/lib/activity-feed/display';
import { ActivityFeedReactions } from '@/components/activity/activity-feed-reactions';

type Props = {
  post: ActivityFeedPost;
  highlightCoachHammers?: boolean;
};

export function ActivityFeedCard({ post, highlightCoachHammers = false }: Props) {
  const [shareLoading, setShareLoading] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');
  const [photos, setPhotos] = useState(post.photos ?? []);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [postRemoved, setPostRemoved] = useState(false);
  const router = useRouter();
  const showShare = canShareActivityPost({ ...post, photos });
  const canManagePhotos = Boolean(post.viewer_can_manage_photos);

  const avatarUrl = activityPostAvatarUrl(post);
  const coachAvatarUrl = activityPostCoachAvatarUrl(post);
  const headline = activityPostHeadline(post);
  const subline = activityPostSubline(post);
  const reviewLine = activityPostReviewLine(post);
  const isMilestone = post.trigger_type === 'milestone_hit';
  const isPhotoPost = post.trigger_type === 'photo_post';

  const onShare = async () => {
    if (shareLoading) return;
    setShareLoading(true);
    try {
      const outcome = await shareActivityPost(post);
      if (outcome === 'copied' || outcome === 'downloaded') {
        setShareState('copied');
        window.setTimeout(() => setShareState('idle'), 2000);
      } else if (outcome === 'failed') {
        window.alert(
          'Could not open the share sheet. Caption copied if possible — paste it in Instagram or Messages.'
        );
      }
    } finally {
      setShareLoading(false);
    }
  };

  const onDeletePhoto = async (photoId: string) => {
    if (deletingPhotoId) return;
    if (!window.confirm('Remove this photo from activity?')) return;

    setDeletingPhotoId(photoId);
    try {
      const res = await fetch(`/api/activity/photos/${photoId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || 'Could not remove photo');
        return;
      }
      if (data.postDeleted) {
        setPostRemoved(true);
        router.refresh();
        return;
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      router.refresh();
    } catch {
      window.alert('Could not remove photo');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  if (postRemoved) return null;

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
              key={photo.id}
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
              {canManagePhotos ? (
                <button
                  type="button"
                  className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 touch-manipulation disabled:opacity-50"
                  aria-label="Remove photo"
                  disabled={deletingPhotoId === photo.id}
                  onClick={() => void onDeletePhoto(photo.id)}
                >
                  {deletingPhotoId === photo.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <X className="h-3.5 w-3.5" aria-hidden />
                  )}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActivityFeedReactions
          postId={post.id}
          initialByReaction={post.kudos_by_reaction}
          initialViewerReactions={post.viewer_reactions}
        />
        {showShare ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 touch-manipulation"
            disabled={shareLoading}
            onClick={() => void onShare()}
            aria-label="Share to Instagram or Facebook"
          >
            {shareLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : shareState === 'copied' ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            ) : (
              <Share2 className="h-3.5 w-3.5" aria-hidden />
            )}
            {shareState === 'copied' ? 'Ready to paste' : 'Share'}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
