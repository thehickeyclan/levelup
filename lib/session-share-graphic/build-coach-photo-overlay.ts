import sharp, { type OverlayOptions } from 'sharp';
import { isUsableCoachCutout } from './fetch-coach-image-buffer';

const SHARE_GRAPHIC_WIDTH = 1080;
const SHARE_GRAPHIC_HEIGHT = 1440;
const FOOTER_H = 132;
/** Top of athlete slot — head can extend into upper red zone. */
const CUTOUT_SLOT_TOP = 72;
/** Bottom anchor — feet sit on mat / footer edge. */
const CUTOUT_SLOT_BOTTOM = SHARE_GRAPHIC_HEIGHT - FOOTER_H + 16;
const CUTOUT_MAX_WIDTH = Math.round(SHARE_GRAPHIC_WIDTH * 0.9);

export type CoachPhotoOverlayInput = {
  cutoutUrl: string | null;
  photoUrl: string | null;
  photoFocusX: number;
  photoFocusY: number;
  sharePhotoScale?: number;
  sharePhotoOffsetX?: number;
  sharePhotoOffsetY?: number;
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

function clampScale(value: number | undefined): number {
  if (value == null || Number.isNaN(value)) return 100;
  return Math.min(150, Math.max(50, Math.round(value)));
}

function clampOffset(value: number | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.min(200, Math.max(-200, Math.round(value)));
}

/** Height-first cutout in the right column; optional per-coach scale/offset. */
async function layoutCutoutOverlay(
  trimmed: Buffer,
  focusX: number,
  scalePct: number,
  offsetX: number,
  offsetY: number
): Promise<OverlayOptions> {
  const slotH = CUTOUT_SLOT_BOTTOM - CUTOUT_SLOT_TOP;
  const targetH = Math.round(slotH * (scalePct / 100));

  const meta = await sharp(trimmed).metadata();
  const srcW = meta.width ?? 1;
  const srcH = meta.height ?? 1;
  let targetW = Math.max(1, Math.round(srcW * (targetH / srcH)));

  let image = await sharp(trimmed).resize(targetW, targetH, { fit: 'fill' }).png().toBuffer();

  if (targetW > CUTOUT_MAX_WIDTH) {
    const cropW = CUTOUT_MAX_WIDTH;
    const fx = Math.min(100, Math.max(0, focusX)) / 100;
    let cropLeft = Math.round(targetW * fx - cropW / 2);
    cropLeft = Math.max(0, Math.min(cropLeft, targetW - cropW));
    image = await sharp(image)
      .extract({ left: cropLeft, top: 0, width: cropW, height: targetH })
      .png()
      .toBuffer();
    targetW = cropW;
  }

  const left = SHARE_GRAPHIC_WIDTH - targetW + 24 + offsetX;
  const top = CUTOUT_SLOT_BOTTOM - targetH + offsetY;

  return { input: image, top, left, blend: 'over' };
}

/** Bottom-right athlete overlay — remove.bg cutout when available; profile crop is last resort. */
export async function buildCoachPhotoOverlay(
  input: CoachPhotoOverlayInput
): Promise<OverlayOptions | null> {
  const focusX = Math.min(100, Math.max(0, input.photoFocusX));
  const focusY = Math.min(100, Math.max(0, input.photoFocusY));
  const scalePct = clampScale(input.sharePhotoScale);
  const offsetX = clampOffset(input.sharePhotoOffsetX);
  const offsetY = clampOffset(input.sharePhotoOffsetY);
  const cropW = 480;
  const cropH = 880;

  let buf: Buffer | null = null;
  let useCutout = false;

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

    return layoutCutoutOverlay(trimmed, focusX, scalePct, offsetX, offsetY);
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

  const portraitScale = scalePct / 100;
  const scaledW = Math.round(cropW * portraitScale);
  const scaledH = Math.round(cropH * portraitScale);
  const scaledPortrait =
    portraitScale === 1
      ? masked
      : await sharp(masked).resize(scaledW, scaledH, { fit: 'fill' }).png().toBuffer();

  const left = SHARE_GRAPHIC_WIDTH - scaledW - 28 + offsetX;
  const top = SHARE_GRAPHIC_HEIGHT - FOOTER_H - scaledH - 4 + offsetY;
  return { input: scaledPortrait, top: Math.max(200, top), left, blend: 'over' };
}
