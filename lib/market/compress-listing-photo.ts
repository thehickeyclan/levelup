import {
  MAX_LISTING_PHOTO_BYTES,
  MAX_LISTING_PHOTO_DIMENSION,
} from '@/lib/market/listing-photo-upload-limits';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read photo'));
    };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not compress photo'));
        else resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

/** Resize and compress listing photos for upload (same constraints as Shoe ID training). */
export async function compressListingPhoto(file: File): Promise<File> {
  if (file.size <= MAX_LISTING_PHOTO_BYTES && file.type === 'image/jpeg') {
    const img = await loadImage(file);
    if (img.width <= MAX_LISTING_PHOTO_DIMENSION && img.height <= MAX_LISTING_PHOTO_DIMENSION) {
      return file;
    }
  }

  const img = await loadImage(file);
  const scale = Math.min(
    1,
    MAX_LISTING_PHOTO_DIMENSION / img.width,
    MAX_LISTING_PHOTO_DIMENSION / img.height
  );
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.88;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > MAX_LISTING_PHOTO_BYTES && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  if (blob.size > MAX_LISTING_PHOTO_BYTES) {
    throw new Error(
      'Photo is still too large after compression — try a smaller image or crop before uploading.'
    );
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}
