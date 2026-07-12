import { buildActivityPostShareCaption } from '@/lib/activity-feed/share-caption';
import type { ActivityFeedPost } from '@/lib/activity-feed/types';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

export type ShareActivityPostOutcome = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed';

function hasNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

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
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = blob.type || 'image/jpeg';
    return new File([blob], filename, { type });
  } catch {
    return null;
  }
}

/** Download a single activity photo (authenticated app image URL). */
export async function downloadActivityPhoto(url: string, photoId: string): Promise<boolean> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return false;
    const blob = await res.blob();
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    downloadBlob(blob, `guild-photo-${photoId.slice(0, 8)}.${ext}`);
    return true;
  } catch {
    return false;
  }
}

/** Share a single activity photo via the native share sheet (or copy/download fallback). */
export async function shareActivityPhoto(
  url: string,
  photoId: string,
  caption?: string
): Promise<ShareActivityPostOutcome> {
  const file = await urlToImageFile(url, `guild-photo-${photoId.slice(0, 8)}.jpg`);
  if (!file) return 'failed';

  const title = 'Guild session photo';
  const text = caption?.trim() || '';

  try {
    const shared = await tryNativeShare({
      files: [file],
      title,
      text,
    });
    if (shared) return 'shared';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
  }

  return shareFallback({ caption: text, title, imageBlob: file });
}

async function copyImageBlobToClipboard(blob: Blob): Promise<boolean> {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
  try {
    const type = blob.type || 'image/png';
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Try Web Share API with file payloads iOS accepts (files-only first). */
async function tryNativeShare(opts: {
  files?: File[];
  title: string;
  text: string;
}): Promise<boolean> {
  if (!hasNativeShare()) return false;

  const attempts: ShareData[] = [];
  if (opts.files?.length) {
    attempts.push({ files: opts.files });
    attempts.push({ files: opts.files, title: opts.title, text: opts.text });
    attempts.push({ files: opts.files, text: opts.text });
  }
  attempts.push({ title: opts.title, text: opts.text });
  attempts.push({ text: opts.text });

  for (const payload of attempts) {
    try {
      await navigator.share(payload);
      return true;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
    }
  }

  return false;
}

async function shareFallback(opts: {
  caption: string;
  title: string;
  imageBlob?: Blob | null;
}): Promise<ShareActivityPostOutcome> {
  if (opts.imageBlob) {
    const imageCopied = await copyImageBlobToClipboard(opts.imageBlob);
    const captionCopied = await copyTextToClipboard(opts.caption);
    if (imageCopied || captionCopied) return 'copied';
  } else {
    const copied = await copyTextToClipboard(opts.caption);
    if (copied) return 'copied';
  }

  if (hasNativeShare()) return 'failed';

  if (opts.imageBlob) {
    downloadBlob(opts.imageBlob, 'guild-activity.png');
    const captionCopied = await copyTextToClipboard(opts.caption);
    return captionCopied ? 'downloaded' : 'failed';
  }

  return 'failed';
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

  return shareFallback({ caption, title: 'Guild session', imageBlob: blob });
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

  const firstBlob = files[0] ? new Blob([files[0]], { type: files[0].type }) : null;
  return shareFallback({
    caption,
    title: 'Guild session photos',
    imageBlob: firstBlob,
  });
}

async function shareTextOnly(caption: string, title: string): Promise<ShareActivityPostOutcome> {
  try {
    const shared = await tryNativeShare({ title, text: caption });
    if (shared) return 'shared';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
  }

  return shareFallback({ caption, title });
}

/** Share an activity post to IG / Facebook via the native share sheet (or copy caption). */
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
