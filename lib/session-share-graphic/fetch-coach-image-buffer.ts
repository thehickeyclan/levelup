import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const ATHLETE_PHOTOS_BUCKET = 'athlete-photos';

export function athletePhotoStoragePath(publicUrl: string): string | null {
  const trimmed = publicUrl.trim().split('#')[0]?.split('?')[0] ?? '';
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

/** Supabase image transform — converts HEIC and other formats sharp may not decode on Linux. */
export function athletePhotoRenderUrl(publicUrl: string): string | null {
  const trimmed = publicUrl.trim();
  if (!trimmed.includes('/object/public/athlete-photos/')) return null;
  const base = trimmed.split('#')[0]?.split('?')[0] ?? trimmed;
  return `${base.replace('/object/public/', '/render/image/public/')}?width=1200&height=1600&resize=contain`;
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

/** Normalize to a raster PNG/JPEG buffer sharp can composite. */
async function normalizeImageBuffer(buf: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buf).rotate().png().toBuffer();
  } catch (e) {
    console.warn('[fetchCoachImageBuffer] sharp normalize failed:', e);
    return null;
  }
}

async function tryLoadUrl(admin: SupabaseClient, url: string): Promise<Buffer | null> {
  const storagePath = athletePhotoStoragePath(url);
  if (storagePath) {
    const fromStorage = await downloadFromStorage(admin, storagePath);
    if (fromStorage) {
      const normalized = await normalizeImageBuffer(fromStorage);
      if (normalized) return normalized;
    }
  }

  const fromHttp = await downloadViaHttp(url);
  if (fromHttp) {
    const normalized = await normalizeImageBuffer(fromHttp);
    if (normalized) return normalized;
  }

  const renderUrl = athletePhotoRenderUrl(url);
  if (renderUrl && renderUrl !== url) {
    const fromRender = await downloadViaHttp(renderUrl);
    if (fromRender) {
      const normalized = await normalizeImageBuffer(fromRender);
      if (normalized) return normalized;
    }
  }

  return null;
}

/** Latest profile photo in `{athleteId}/` when URL is stale or unparsable. */
async function fetchLatestAthletePhotoFromStorage(
  admin: SupabaseClient,
  athleteId: string
): Promise<Buffer | null> {
  const { data, error } = await admin.storage.from(ATHLETE_PHOTOS_BUCKET).list(athleteId, {
    limit: 25,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error || !data?.length) {
    console.warn('[fetchCoachImageBuffer] storage list failed:', athleteId, error?.message);
    return null;
  }

  const imageExt = /\.(jpe?g|png|webp|heic|heif|gif)$/i;
  const files = data.filter(
    (f) =>
      f.name &&
      f.name !== 'cutout.png' &&
      !f.name.startsWith('.') &&
      (f.metadata?.mimetype?.startsWith('image/') || imageExt.test(f.name))
  );

  for (const file of files) {
    const path = `${athleteId}/${file.name}`;
    const fromStorage = await downloadFromStorage(admin, path);
    if (!fromStorage) continue;
    const normalized = await normalizeImageBuffer(fromStorage);
    if (normalized) return normalized;

    const { data: urlData } = admin.storage.from(ATHLETE_PHOTOS_BUCKET).getPublicUrl(path);
    const viaRender = await tryLoadUrl(admin, urlData.publicUrl);
    if (viaRender) return viaRender;
  }

  return null;
}

/**
 * Load coach photo for share graphics — storage API first (works on Vercel), then HTTP/render.
 */
export async function fetchCoachImageBuffer(
  admin: SupabaseClient,
  publicUrl: string | null | undefined,
  athleteId?: string | null
): Promise<Buffer | null> {
  if (publicUrl?.trim()) {
    const loaded = await tryLoadUrl(admin, publicUrl.trim());
    if (loaded) return loaded;
  }

  if (athleteId?.trim()) {
    return fetchLatestAthletePhotoFromStorage(admin, athleteId.trim());
  }

  return null;
}

/** Reject empty/transparent cutouts so we fall back to the profile photo. */
export async function isUsableCoachCutout(buf: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buf).metadata();
    if ((meta.width ?? 0) < 80 || (meta.height ?? 0) < 80) return false;
    const stats = await sharp(buf).ensureAlpha().stats();
    const alpha = stats.channels[3];
    if (alpha && alpha.max < 8) return false;
    return true;
  } catch {
    return false;
  }
}
