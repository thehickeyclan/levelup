import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCoachImageBuffer } from '@/lib/session-share-graphic/fetch-coach-image-buffer';

const PLACEHOLDER_KEYS = new Set(['true', 'false', 'yes', 'no', '1', '0', 'enabled', 'disabled']);

/** Real remove.bg API key from env — rejects placeholders like "True". */
export function getRemoveBgApiKey(): string | null {
  const raw = process.env.REMOVE_BG_API_KEY?.trim();
  if (!raw) return null;
  if (PLACEHOLDER_KEYS.has(raw.toLowerCase())) {
    console.warn(
      '[remove.bg] REMOVE_BG_API_KEY looks like a placeholder (e.g. "True") — set your real key from remove.bg/api'
    );
    return null;
  }
  if (raw.length < 12) {
    console.warn('[remove.bg] REMOVE_BG_API_KEY is too short to be a valid API key');
    return null;
  }
  return raw;
}

/** Remove.bg subject-only PNG; cached on athletes.photo_cutout_url. */
export async function ensureCoachPhotoCutout(
  admin: SupabaseClient,
  athleteId: string,
  photoUrl: string | null | undefined,
  existingCutoutUrl: string | null | undefined
): Promise<string | null> {
  if (!photoUrl?.trim()) return null;
  if (existingCutoutUrl?.trim()) return existingCutoutUrl.trim();

  const apiKey = getRemoveBgApiKey();
  if (!apiKey) return null;

  try {
    const imageBuf = await fetchCoachImageBuffer(admin, photoUrl, athleteId);
    if (!imageBuf) return null;

    const formData = new FormData();
    formData.append('image_file', new Blob([new Uint8Array(imageBuf)]), 'coach.jpg');
    formData.append('size', 'auto');
    formData.append('type', 'person');
    formData.append('format', 'png');

    const rbgRes = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData,
    });

    if (!rbgRes.ok) {
      console.warn('[ensureCoachPhotoCutout] remove.bg:', rbgRes.status);
      return null;
    }

    const cleanBuffer = Buffer.from(await rbgRes.arrayBuffer());
    const cutoutPath = `${athleteId}/cutout.png`;

    const { data: uploadData, error: uploadError } = await admin.storage
      .from('athlete-photos')
      .upload(cutoutPath, cleanBuffer, {
        contentType: 'image/png',
        cacheControl: '86400',
        upsert: true,
      });

    if (uploadError) {
      console.warn('[ensureCoachPhotoCutout] upload:', uploadError.message);
      return null;
    }

    const { data: urlData } = admin.storage.from('athlete-photos').getPublicUrl(uploadData.path);
    const cutoutUrl = urlData.publicUrl;

    await admin.from('athletes').update({ photo_cutout_url: cutoutUrl }).eq('id', athleteId);

    return cutoutUrl;
  } catch (e) {
    console.warn('[ensureCoachPhotoCutout]', e);
    return null;
  }
}

export function cutoutStoragePathFromUrl(photoUrl: string): string | null {
  const m = photoUrl.match(/\/storage\/v1\/object\/public\/athlete-photos\/(.+)/);
  return m?.[1] ?? null;
}

export async function clearCoachPhotoCutout(
  admin: SupabaseClient,
  athleteId: string,
  existingCutoutUrl: string | null | undefined
): Promise<void> {
  await admin.from('athletes').update({ photo_cutout_url: null }).eq('id', athleteId);
  if (existingCutoutUrl) {
    const path = cutoutStoragePathFromUrl(existingCutoutUrl);
    if (path) {
      await admin.storage.from('athlete-photos').remove([path]);
    }
  }
  // Also try canonical cutout path
  await admin.storage.from('athlete-photos').remove([`${athleteId}/cutout.png`]);
}
