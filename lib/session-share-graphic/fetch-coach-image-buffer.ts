import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const ATHLETE_PHOTOS_BUCKET = 'athlete-photos';

export function athletePhotoStoragePath(publicUrl: string): string | null {
  const trimmed = publicUrl.trim();
  const patterns = [
    /\/storage\/v1\/object\/public\/athlete-photos\/(.+)$/i,
    /\/object\/public\/athlete-photos\/(.+)$/i,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  return null;
}

async function downloadFromStorage(
  admin: SupabaseClient,
  storagePath: string
): Promise<Buffer | null> {
  const { data, error } = await admin.storage.from(ATHLETE_PHOTOS_BUCKET).download(storagePath);
  if (error || !data) {
    console.warn('[fetchCoachImageBuffer] storage download failed:', storagePath, error?.message);
    return null;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.length > 0 ? buf : null;
}

async function downloadViaHttp(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'image/*' },
    });
    if (!res.ok) {
      console.warn('[fetchCoachImageBuffer] HTTP', res.status, url.slice(0, 120));
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch (e) {
    console.warn('[fetchCoachImageBuffer] HTTP fetch failed:', e);
    return null;
  }
}

/** Normalize to a raster PNG/JPEG buffer sharp can composite (handles HEIC when supported). */
async function normalizeImageBuffer(buf: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buf).rotate().png().toBuffer();
  } catch (e) {
    console.warn('[fetchCoachImageBuffer] sharp normalize failed:', e);
    return null;
  }
}

/**
 * Load coach photo for share graphics — storage API first (works on Vercel), then HTTP.
 */
export async function fetchCoachImageBuffer(
  admin: SupabaseClient,
  publicUrl: string | null | undefined
): Promise<Buffer | null> {
  if (!publicUrl?.trim()) return null;
  const url = publicUrl.trim();

  const storagePath = athletePhotoStoragePath(url);
  if (storagePath) {
    const fromStorage = await downloadFromStorage(admin, storagePath);
    if (fromStorage) {
      const normalized = await normalizeImageBuffer(fromStorage);
      if (normalized) return normalized;
    }
  }

  const fromHttp = await downloadViaHttp(url);
  if (!fromHttp) return null;
  return normalizeImageBuffer(fromHttp);
}
