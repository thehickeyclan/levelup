/** Pick the completed session closest to when a photo was taken (within 8 hours). */
export function suggestSessionIdFromPhotoTime(
  sessions: { id: string; scheduled_datetime: string }[],
  photoTakenAt: Date
): string | null {
  const photoMs = photoTakenAt.getTime();
  const maxDiffMs = 8 * 60 * 60 * 1000;

  let best: { id: string; diff: number } | null = null;
  for (const s of sessions) {
    const sessionMs = new Date(s.scheduled_datetime).getTime();
    const diff = Math.abs(photoMs - sessionMs);
    if (diff <= maxDiffMs && (!best || diff < best.diff)) {
      best = { id: s.id, diff };
    }
  }
  return best?.id ?? null;
}
