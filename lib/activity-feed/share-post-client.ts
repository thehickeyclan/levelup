import { buildActivityPostShareCaption } from '@/lib/activity-feed/share-caption';
import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

export type ShareActivityPostOutcome = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function urlToImageFile(url: string, filename: string): Promise<File | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type || 'image/jpeg';
    return new File([blob], filename, { type });
  } catch {
    return null;
  }
}

async function tryNativeShare(opts: {
  files?: File[];
  title: string;
  text: string;
}): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  try {
    if (opts.files?.length) {
      const payload = { files: opts.files, title: opts.title, text: opts.text };
      if (navigator.canShare && !navigator.canShare(payload)) return false;
      await navigator.share(payload);
      return true;
    }
    await navigator.share({ title: opts.title, text: opts.text });
    return true;
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return false;
  }
}

async function shareSessionGraphic(post: ActivityFeedPost, caption: string): Promise<ShareActivityPostOutcome> {
  const res = await fetch(`/api/activity/posts/${post.id}/share-image`, { credentials: 'include' });
  if (!res.ok) return 'failed';
  const blob = await res.blob();
  const file = new File([blob], `guild-activity-${post.id.slice(0, 8)}.png`, { type: 'image/png' });

  try {
    const shared = await tryNativeShare({
      files: [file],
      title: 'Guild session',
      text: caption,
    });
    if (shared) return 'shared';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
  }

  downloadBlob(blob, file.name);
  const copied = await copyTextToClipboard(caption);
  return copied ? 'downloaded' : 'failed';
}

async function sharePhotoPost(post: ActivityFeedPost, caption: string): Promise<ShareActivityPostOutcome> {
  const photos = [...(post.photos ?? [])].sort((a, b) => a.display_order - b.display_order);
  const files: File[] = [];
  for (let i = 0; i < photos.length; i++) {
    const file = await urlToImageFile(photos[i].url, `guild-photo-${i + 1}.jpg`);
    if (file) files.push(file);
  }
  if (files.length === 0) return 'failed';

  try {
    const shared = await tryNativeShare({
      files,
      title: 'Guild session photos',
      text: caption,
    });
    if (shared) return 'shared';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
  }

  downloadBlob(files[0], files[0].name);
  const copied = await copyTextToClipboard(caption);
  return copied ? 'downloaded' : 'failed';
}

async function shareTextOnly(caption: string, title: string): Promise<ShareActivityPostOutcome> {
  try {
    const shared = await tryNativeShare({ title, text: caption });
    if (shared) return 'shared';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
  }

  const copied = await copyTextToClipboard(caption);
  return copied ? 'copied' : 'failed';
}

/** Share an activity post to IG / Facebook via the native share sheet (or download + copy caption). */
export async function shareActivityPost(post: ActivityFeedPost): Promise<ShareActivityPostOutcome> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const caption = buildActivityPostShareCaption(post, origin);

  if (post.trigger_type === 'session_completed') {
    return shareSessionGraphic(post, caption);
  }
  if (post.trigger_type === 'photo_post') {
    return sharePhotoPost(post, caption);
  }
  if (post.trigger_type === 'milestone_hit') {
    return shareTextOnly(caption, 'Guild milestone');
  }

  return 'failed';
}
