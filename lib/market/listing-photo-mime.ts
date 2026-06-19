const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function resolveListingPhotoMime(
  file: File
): { contentType: string; ext: string } | { error: string } {
  const type = file.type?.toLowerCase() || '';
  const name = file.name?.trim() || '';
  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (ALLOWED_MIMES.has(type)) {
    const outExt =
      type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    return { contentType: type, ext: outExt };
  }

  const extToMime: Record<string, { contentType: string; ext: string }> = {
    jpg: { contentType: 'image/jpeg', ext: 'jpg' },
    jpeg: { contentType: 'image/jpeg', ext: 'jpg' },
    png: { contentType: 'image/png', ext: 'png' },
    webp: { contentType: 'image/webp', ext: 'webp' },
  };

  if (extToMime[ext]) {
    return extToMime[ext];
  }

  // Mobile pickers often send empty type with valid JPEG bytes.
  if ((!type || type === 'application/octet-stream') && file.size > 0) {
    return { contentType: 'image/jpeg', ext: 'jpg' };
  }

  return {
    error:
      'Could not read this photo. Try again or use JPEG/PNG from your camera roll.',
  };
}
