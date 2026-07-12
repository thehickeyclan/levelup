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

export function historyMentionsAthleteEdition(
  history: string,
  model?: string | null
): boolean {
  if (!history.trim() || modelNameImpliesAthleteEdition(model)) return false;
  return ATHLETE_EDITION_PATTERN.test(history);
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

export function sanitizeCatalogHistoryText(
  history: string | null | undefined,
  brand: string,
  model: string
): string | null {
  const trimmed = history?.trim();
  if (!trimmed) return null;

  let text = stripAthleteEditionFromDescription(trimmed, model);
  text = sanitizeCatalogDisplayText(text) ?? text;

  if (historyMentionsAthleteEdition(text, model)) {
    const curated = curatedCatalogHistory(brand, model);
    if (curated) return curated;
  }

  return text || null;
}

const CURATED_CATALOG_HISTORY: Record<string, string> = {
  'adidas|combat speed 4':
    'The Adidas Combat Speed 4 sits in adidas\'s long-running Combat Speed line, pairing a lightweight mesh upper with split-suede overlays on a split-sole platform tuned for competition speed and mat traction. As a retail staple rather than an athlete-exclusive release, standard Combat Speed 4 colorways target wrestlers who want a low-profile, flexible fit without the bulk of a training shoe. Collectors and competitors alike track deadstock retail pairs, but the model\'s identity is defined by weight and split-sole agility — not a single signature tie-in.',
};

export function curatedCatalogHistory(brand: string, model: string): string | null {
  const key = `${brand.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
  return CURATED_CATALOG_HISTORY[key] ?? null;
}
