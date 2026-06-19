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

/** Infer generic color from a specific colorway name (Glacier → blue). */
export function inferColorFamilyFromColorway(colorway: string | null | undefined): ColorFamilyId | null {
  const raw = colorway?.trim();
  if (!raw) return null;
  const t = raw.toLowerCase();

  if (/\bmulti\b|multi-?color|two[- ]?tone|tri[- ]?color/.test(t) || (t.includes('/') && t.split('/').length >= 2)) {
    return 'multi';
  }

  const rules: { id: ColorFamilyId; pattern: RegExp }[] = [
    {
      id: 'blue',
      pattern:
        /\b(blue|navy|glacier|carolina|royal|cyan|teal|aqua|azure|indigo|sapphire|midnight)\b/,
    },
    { id: 'red', pattern: /\b(red|cherry|crimson|scarlet|burgundy|maroon|cardinal)\b/ },
    { id: 'black', pattern: /\b(black|onyx|charcoal|graphite)\b/ },
    { id: 'white', pattern: /\b(white|cream|ivory|pearl|silver\/white)\b/ },
    { id: 'gold', pattern: /\b(gold|yellow|maize|volt|amber|mustard)\b/ },
    { id: 'green', pattern: /\b(green|olive|camo|forest|lime|neon green)\b/ },
    { id: 'orange', pattern: /\b(orange|coral)\b/ },
    { id: 'pink', pattern: /\b(pink|rose|magenta|fuchsia)\b/ },
    { id: 'purple', pattern: /\b(purple|violet|grape|plum)\b/ },
  ];

  for (const { id, pattern } of rules) {
    if (pattern.test(t)) return id;
  }

  return 'other';
}

/** Stored color_family wins; otherwise infer from colorway for browse/filter/display. */
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
