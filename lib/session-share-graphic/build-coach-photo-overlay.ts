import sharp, { type OverlayOptions } from 'sharp';
import { isUsableCoachCutout } from './fetch-coach-image-buffer';

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

/** Cover-crop to WxH anchored at focus point (0–100), same as CSS object-position %. */
async function cropPortraitWithFocus(
  buf: Buffer,
  cropW: number,
  cropH: number,
  focusX: number,
  focusY: number
): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const iw = meta.width ?? cropW;
  const ih = meta.height ?? cropH;

  const scale = Math.max(cropW / iw, cropH / ih);
  const scaledW = Math.max(cropW, Math.round(iw * scale));
  const scaledH = Math.max(cropH, Math.round(ih * scale));

  const resized = await sharp(buf).resize(scaledW, scaledH, { fit: 'fill' }).png().toBuffer();

  const px = Math.round((focusX / 100) * scaledW);
  const py = Math.round((focusY / 100) * scaledH);

  let left = px - Math.round(cropW / 2);
  let top = py - Math.round(cropH / 2);
  left = Math.max(0, Math.min(left, scaledW - cropW));
  top = Math.max(0, Math.min(top, scaledH - cropH));

  return sharp(resized).extract({ left, top, width: cropW, height: cropH }).png().toBuffer();
}

/** Bottom-right athlete overlay — remove.bg cutout when available; profile crop is last resort. */
export async function buildCoachPhotoOverlay(
  input: CoachPhotoOverlayInput
): Promise<OverlayOptions | null> {
  const focusX = Math.min(100, Math.max(0, input.photoFocusX));
  const focusY = Math.min(100, Math.max(0, input.photoFocusY));
  const cropW = 480;
  const cropH = 880;

  let buf: Buffer | null = null;
  let useCutout = false;

  // Athlete-only PNG (transparent background) — matches manual Canva posts.
  if (input.cutoutUrl?.trim()) {
    const cutoutBuf = await input.fetchImage(input.cutoutUrl.trim());
    if (cutoutBuf && (await isUsableCoachCutout(cutoutBuf))) {
      buf = cutoutBuf;
      useCutout = true;
    } else if (cutoutBuf) {
      console.warn('[buildCoachPhotoOverlay] cutout unusable, falling back to profile photo');
    }
  }

  if (!buf && input.photoUrl?.trim()) {
    buf = await input.fetchImage(input.photoUrl.trim());
  }

  if (!buf) {
    console.warn('[buildCoachPhotoOverlay] could not load coach photo');
    return null;
  }

  if (useCutout) {
    const trimmed = await sharp(buf)
      .ensureAlpha()
      .trim({ threshold: 12 })
      .png()
      .toBuffer();

    // Fill most of the right column — manual posts show waist-up, hero-sized.
    const maxW = Math.round(SHARE_GRAPHIC_WIDTH * 0.78);
    const maxH = SHARE_GRAPHIC_HEIGHT - FOOTER_H - 48;

    const resized = await sharp(trimmed)
      .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
    const meta = await sharp(resized).metadata();
    const w = meta.width ?? maxW;
    const h = meta.height ?? maxH;
    const left = SHARE_GRAPHIC_WIDTH - w + 16;
    const top = SHARE_GRAPHIC_HEIGHT - FOOTER_H - h + 32;
    return { input: resized, top: Math.max(100, top), left, blend: 'over' };
  }

  const portrait = await cropPortraitWithFocus(buf, cropW, cropH, focusX, focusY);

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
