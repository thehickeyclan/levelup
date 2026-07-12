/** Strip markdown bullets and extra whitespace from catalog/AI spec fields. */
export function sanitizeCatalogDisplayText(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/\*\s*/g, '')
    .replace(/\s+\*\s+/g, '; ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const ATHLETE_EDITION_PATTERN =
  /\b(jordan oliver|\bjo\b|david taylor|kyle dake|j['']?den smith|burroughs|signature edition|athlete signature|player exclusive|pe edition)\b/i;

export function modelNameImpliesAthleteEdition(model: string | null | undefined): boolean {
  const m = (model ?? '').trim();
  if (!m) return false;
  return ATHLETE_EDITION_PATTERN.test(m);
}

/** Remove athlete-edition sentences when the model name is a base retail SKU. */
export function stripAthleteEditionFromDescription(
  description: string,
  model?: string | null
): string {
  if (!description.trim() || modelNameImpliesAthleteEdition(model)) return description;

  const sentences = description.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [description];
  const kept = sentences.filter((sentence) => !ATHLETE_EDITION_PATTERN.test(sentence));
  return kept.join(' ').replace(/\s{2,}/g, ' ').trim() || description;
}
