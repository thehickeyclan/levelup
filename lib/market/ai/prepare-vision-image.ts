import sharp from 'sharp';

/** Anthropic vision works well below ~1.5MB per image; keep decoded payload conservative. */
const MAX_DIMENSION = 1568;
const JPEG_QUALITY = 82;
const MAX_OUTPUT_BYTES = 850_000;

/** Resize and compress an image buffer for Claude vision API requests. */
export async function prepareVisionImage(
  input: Buffer,
  contentType?: string
): Promise<{ buffer: Buffer; mediaType: string }> {
  if (!input.length) {
    return { buffer: input, mediaType: 'image/jpeg' };
  }

  try {
    const meta = await sharp(input).metadata();
    const withinSize =
      input.length <= MAX_OUTPUT_BYTES &&
      (meta.width ?? 0) <= MAX_DIMENSION &&
      (meta.height ?? 0) <= MAX_DIMENSION;
    const mt = contentType?.split(';')[0] || 'image/jpeg';
    if (withinSize && (mt === 'image/jpeg' || mt === 'image/png' || mt === 'image/webp')) {
      return { buffer: input, mediaType: mt };
    }

    let quality = JPEG_QUALITY;
    let buffer = await sharp(input)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    while (buffer.length > MAX_OUTPUT_BYTES && quality > 45) {
      quality -= 12;
      buffer = await sharp(input)
        .rotate()
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
    }

    return { buffer, mediaType: 'image/jpeg' };
  } catch (e) {
    console.error('prepareVisionImage failed:', e);
    return { buffer: input, mediaType: contentType?.split(';')[0] || 'image/jpeg' };
  }
}
