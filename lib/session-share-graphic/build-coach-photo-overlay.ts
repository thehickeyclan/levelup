import sharp, { type OverlayOptions } from 'sharp';

const SHARE_GRAPHIC_WIDTH = 1080;
const SHARE_GRAPHIC_HEIGHT = 1440;
const FOOTER_H = 132;

export type CoachPhotoOverlayInput = {
  cutoutUrl: string | null;
  photoUrl: string | null;
  photoFocusX: number;
  photoFocusY: number;
  fetchImage: (url: string) => Promise<Buffer | null>;
};

/** Bottom-right athlete overlay — transparent cutout when available, else tight portrait crop. */
export async function buildCoachPhotoOverlay(
  input: CoachPhotoOverlayInput
): Promise<OverlayOptions | null> {
  let useCutout = Boolean(input.cutoutUrl?.trim());
  let url = (useCutout ? input.cutoutUrl : input.photoUrl)?.trim() ?? null;

  let buf: Buffer | null = null;
  if (url) buf = await input.fetchImage(url);

  // Bad/missing cutout — fall back to full profile photo so Liam still appears.
  if (!buf && useCutout && input.photoUrl?.trim()) {
    useCutout = false;
    url = input.photoUrl.trim();
    buf = await input.fetchImage(url);
  }

  if (!buf) {
    if (url) console.warn('[buildCoachPhotoOverlay] could not load coach photo:', url.slice(0, 100));
    return null;
  }

  if (useCutout) {
    const resized = await sharp(buf)
      .ensureAlpha()
      .resize(560, 1000, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
    const meta = await sharp(resized).metadata();
    const w = meta.width ?? 560;
    const h = meta.height ?? 1000;
    const left = SHARE_GRAPHIC_WIDTH - w - 20;
    const top = SHARE_GRAPHIC_HEIGHT - FOOTER_H - h - 4;
    return { input: resized, top: Math.max(180, top), left, blend: 'over' };
  }

  const focusX = Math.min(100, Math.max(0, input.photoFocusX));
  const focusY = Math.min(100, Math.max(0, input.photoFocusY));
  const cropW = 480;
  const cropH = 880;

  const portrait = await sharp(buf)
    .resize(cropW, cropH, {
      fit: 'cover',
      position: `${focusX}% ${focusY}%`,
    })
    .png()
    .toBuffer();

  const fadeMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cropW}" height="${cropH}">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="white" stop-opacity="0"/>
          <stop offset="35%" stop-color="white" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="white" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#fade)"/>
    </svg>`
  );

  const masked = await sharp(portrait)
    .composite([{ input: fadeMask, blend: 'dest-in' }])
    .png()
    .toBuffer()
    .catch(async () => portrait);

  const left = SHARE_GRAPHIC_WIDTH - cropW - 28;
  const top = SHARE_GRAPHIC_HEIGHT - FOOTER_H - cropH - 4;
  return { input: masked, top: Math.max(200, top), left, blend: 'over' };
}
