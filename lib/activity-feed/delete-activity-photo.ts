import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertCanPostPhotosToSession,
  type PhotoPostActor,
} from '@/lib/activity-feed/photo-post-auth';

const BUCKET = 'activity-photos';

export type DeleteActivityPhotoResult =
  | { ok: true; postId: string; postDeleted: boolean; remainingPhotos: number }
  | { ok: false; status: number; error: string };

/** Remove one activity photo from storage and DB; delete the post if it was the last photo. */
export async function deleteActivityPhoto(
  admin: SupabaseClient,
  photoId: string,
  actor: PhotoPostActor
): Promise<DeleteActivityPhotoResult> {
  const { data: photo, error: photoErr } = await admin
    .from('activity_photos')
    .select('id, post_id, storage_path')
    .eq('id', photoId)
    .maybeSingle();

  if (photoErr) {
    return { ok: false, status: 500, error: photoErr.message };
  }
  if (!photo) {
    return { ok: false, status: 404, error: 'Photo not found' };
  }

  const postId = photo.post_id as string;

  const { data: post, error: postErr } = await admin
    .from('activity_posts')
    .select('id, trigger_type, session_id, youth_wrestler_id, coach_id')
    .eq('id', postId)
    .maybeSingle();

  if (postErr || !post) {
    return { ok: false, status: 404, error: 'Post not found' };
  }
  if (post.trigger_type !== 'photo_post') {
    return { ok: false, status: 400, error: 'Not a photo post' };
  }

  if (actor.role !== 'admin') {
    const sessionId = post.session_id as string | null;
    if (!sessionId) {
      return { ok: false, status: 400, error: 'Post has no session' };
    }
    const access = await assertCanPostPhotosToSession(
      admin,
      actor,
      sessionId,
      (post.youth_wrestler_id as string | null) ?? null
    );
    if (!access.ok) {
      return { ok: false, status: access.status, error: access.error };
    }
  }

  const storagePath = photo.storage_path as string;
  const { error: storageErr } = await admin.storage.from(BUCKET).remove([storagePath]);
  if (storageErr) {
    console.error('activity photo storage delete:', storageErr);
  }

  const { error: rowErr } = await admin.from('activity_photos').delete().eq('id', photoId);
  if (rowErr) {
    return { ok: false, status: 500, error: rowErr.message };
  }

  const { count } = await admin
    .from('activity_photos')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);

  const remainingPhotos = count ?? 0;
  let postDeleted = false;

  if (remainingPhotos === 0) {
    const { error: postDelErr } = await admin.from('activity_posts').delete().eq('id', postId);
    if (postDelErr) {
      return { ok: false, status: 500, error: postDelErr.message };
    }
    postDeleted = true;
  }

  return { ok: true, postId, postDeleted, remainingPhotos };
}
