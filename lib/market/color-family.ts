/** Generic browse color — what casual buyers search for (blue, not Glacier). */
export type ColorFamilyId =
  | 'blue'
  | 'red'
  | 'black'
  | 'white'
  | 'gold'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'multi'
  | 'other';

export const BROWSE_COLOR_FAMILIES: { id: ColorFamilyId; label: string }[] = [
  { id: 'blue', label: 'Blue' },
  { id: 'red', label: 'Red' },
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
  { id: 'gold', label: 'Gold' },
  { id: 'green', label: 'Green' },
  { id: 'orange', label: 'Orange' },
  { id: 'pink', label: 'Pink' },
  { id: 'purple', label: 'Purple' },
  { id: 'multi', label: 'Multi' },
  { id: 'other', label: 'Other' },
];

const COLOR_FAMILY_IDS = new Set<string>(BROWSE_COLOR_FAMILIES.map((c) => c.id));

const EXPLICIT_MULTI_PATTERN = /\bmulti\b|multi-?color|two[- ]?tone|tri[- ]?color/;

const COLOR_FAMILY_RULES: { id: ColorFamilyId; pattern: RegExp }[] = [
  {
    id: 'blue',
    pattern:
      /\b(blue|navy|glacier|carolina|royal|cyan|teal|aqua|azure|indigo|sapphire|midnight)\b/,
  },
  { id: 'red', pattern: /\b(red|cherry|crimson|scarlet|burgundy|maroon|cardinal)\b/ },
  { id: 'black', pattern: /\b(black|onyx|charcoal|graphite|obsidian|jet)\b/ },
  {
    id: 'white',
    pattern: /\b(white|cream|ivory|pearl|platinum|pewter|silver\/white|silver)\b/,
  },
  { id: 'gold', pattern: /\b(gold|yellow|maize|volt|amber|mustard|lemon)\b/ },
  { id: 'green', pattern: /\b(green|olive|camo|forest|lime|neon green)\b/ },
  { id: 'orange', pattern: /\b(orange|coral)\b/ },
  { id: 'pink', pattern: /\b(pink|rose|magenta|fuchsia)\b/ },
  { id: 'purple', pattern: /\b(purple|violet|grape|plum)\b/ },
];

export function parseColorFamily(value: string | null | undefined): ColorFamilyId | null {
  const v = value?.trim().toLowerCase();
  if (!v || !COLOR_FAMILY_IDS.has(v)) return null;
  return v as ColorFamilyId;
}

export function colorFamilyLabel(id: ColorFamilyId | string | null | undefined): string | null {
  const parsed = parseColorFamily(id);
  if (!parsed) return null;
  return BROWSE_COLOR_FAMILIES.find((c) => c.id === parsed)?.label ?? null;
}

/** Split a colorway into named color segments (e.g. "Platinum / Blue / Volt"). */
export function splitColorwaySegments(colorway: string): string[] {
  return colorway
    .split(/\s*[/&,+]\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Infer one color family from a single segment or short phrase. */
export function inferColorFamilyFromSegment(text: string): ColorFamilyId | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (EXPLICIT_MULTI_PATTERN.test(t)) return 'multi';
  for (const { id, pattern } of COLOR_FAMILY_RULES) {
    if (pattern.test(t)) return id;
  }
  return 'other';
}

/** All browse color families detected in a colorway (each slash-separated segment + full string). */
export function inferColorFamiliesFromColorway(colorway: string | null | undefined): ColorFamilyId[] {
  const raw = colorway?.trim();
  if (!raw) return [];

  const found = new Set<ColorFamilyId>();
  const segments = splitColorwaySegments(raw);
  const textsToScan = segments.length > 1 ? [...segments, raw] : [raw];

  for (const text of textsToScan) {
    const id = inferColorFamilyFromSegment(text);
    if (id) found.add(id);
  }

  const concrete = [...found].filter((f) => f !== 'other' && f !== 'multi');
  if (concrete.length >= 2) found.add('multi');

  const ordered = BROWSE_COLOR_FAMILIES.map((c) => c.id).filter((id) => found.has(id));
  if (ordered.length) return ordered;
  return found.has('other') ? ['other'] : [];
}

/** Infer generic primary color from a specific colorway name (Glacier → blue). */
export function inferColorFamilyFromColorway(colorway: string | null | undefined): ColorFamilyId | null {
  const families = inferColorFamiliesFromColorway(colorway);
  if (!families.length) return null;
  if (families.length === 1) return families[0];

  const segments = splitColorwaySegments(colorway?.trim() ?? '');
  for (const segment of segments) {
    const id = inferColorFamilyFromSegment(segment);
    if (id && id !== 'other' && id !== 'multi') return id;
  }

  return families.find((f) => f !== 'multi' && f !== 'other') ?? families[0];
}

/** All color families for browse filter — union of stored family + every color in the colorway. */
export function listingBrowseColorFamilies(
  colorFamily: string | null | undefined,
  colorway: string | null | undefined
): ColorFamilyId[] {
  const found = new Set<ColorFamilyId>(inferColorFamiliesFromColorway(colorway));
  const stored = parseColorFamily(colorFamily);
  if (stored) found.add(stored);

  const concrete = [...found].filter((f) => f !== 'other' && f !== 'multi');
  if (concrete.length >= 2) found.add('multi');

  const ordered = BROWSE_COLOR_FAMILIES.map((c) => c.id).filter((id) => found.has(id));
  if (ordered.length) return ordered;
  return found.has('other') ? ['other'] : [];
}

export function matchesBrowseColorFilter(
  filterId: string,
  browseColors: ColorFamilyId[] | null | undefined
): boolean {
  if (!filterId || filterId === 'all') return true;
  const parsed = parseColorFamily(filterId);
  if (!parsed || !browseColors?.length) return false;
  return browseColors.includes(parsed);
}

/** Stored color_family wins; otherwise infer from colorway for browse/display primary chip. */
export function effectiveListingColorFamily(
  colorFamily: string | null | undefined,
  colorway: string | null | undefined
): ColorFamilyId | null {
  return parseColorFamily(colorFamily) ?? inferColorFamilyFromColorway(colorway);
}

/** Card/detail chip: "Blue · Glacier" or "Blue" when no colorway name. */
export function formatListingColorLabel(
  colorFamily: string | null | undefined,
  colorway: string | null | undefined
): string | null {
  const family = effectiveListingColorFamily(colorFamily, colorway);
  const familyLabel = family ? colorFamilyLabel(family) : null;
  const cw = colorway?.trim() || null;

  if (familyLabel && cw) {
    const cwLower = cw.toLowerCase();
    const famLower = familyLabel.toLowerCase();
    if (cwLower === famLower || cwLower.includes(famLower)) return familyLabel;
    return `${familyLabel} · ${cw}`;
  }
  if (familyLabel) return familyLabel;
  return cw;
}
