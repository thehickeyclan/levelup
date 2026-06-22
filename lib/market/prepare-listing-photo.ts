import { compressListingPhoto } from '@/lib/market/compress-listing-photo';

/** Normalize mobile camera-roll picks (HEIC, empty MIME) to JPEG for market uploads. */
export async function prepareListingPhoto(file: File): Promise<File> {
  const normalized = await normalizeListingPhotoFile(file);
  return compressListingPhoto(normalized);
}

async function normalizeListingPhotoFile(file: File): Promise<File> {
  const name = file.name?.trim() || 'photo.jpg';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const type = file.type?.toLowerCase() || '';

  const isHeic =
    type === 'image/heic' ||
    type === 'image/heif' ||
    ext === 'heic' ||
    ext === 'heif';

  if (isHeic) {
    const { default: heic2any } = await import('heic2any');
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
    const baseName = name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([jpegBlob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  }

  const extToMime: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };

  if ((!type || type === 'application/octet-stream') && extToMime[ext]) {
    return new File([file], name, { type: extToMime[ext], lastModified: file.lastModified });
  }

  // iOS sometimes omits both type and extension — still a JPEG from the picker.
  if (!type && !extToMime[ext] && file.size > 0) {
    const baseName = name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([file], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  }

  return file;
}

/** Sequential — parallel canvas work on iOS often drops photos 2+ from multi-select batches. */
export async function prepareListingPhotos(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    out.push(await prepareListingPhoto(file));
  }
  return out;
}
