/**
 * Mandatory disclosure tags — docs/market-listing-standards.md §3.
 *
 * One source of truth for codes, seller-facing wording, and buyer-facing
 * badges. REPLICA is deliberately NOT here: per §5.2 it is a locked tag
 * that moves a listing into the Replica/Tribute category, and it ships
 * with that category, never as a free-floating pill.
 */

export const DISCLOSURE_TAGS = [
  {
    code: 'sole_swapped',
    label: 'Sole swapped',
    seller: 'Soles have been replaced. Legit, valuable work — buyers just need to know.',
    buyer: 'SOLE SWAPPED',
  },
  {
    code: 'repaired',
    label: 'Repaired',
    seller: 'Stitching, re-gluing, a patch, or any structural repair.',
    buyer: 'REPAIRED',
  },
  {
    code: 'custom_painted',
    label: 'Custom painted',
    seller: 'Any paint or colorway alteration — genuine shoe, aftermarket finish.',
    buyer: 'CUSTOM PAINTED',
  },
  {
    code: 'custom_build',
    label: 'Custom build',
    seller: 'A bespoke build, including builds on another model’s upper.',
    buyer: 'CUSTOM BUILD',
  },
  {
    code: 'mismatched_pair',
    label: 'Mismatched pair',
    seller: 'The two shoes differ in colorway, size, or production run.',
    buyer: 'MISMATCHED PAIR',
  },
  {
    code: 'display_only',
    label: 'Display only',
    seller: 'Fragile or dry-rotted vintage that should not be wrestled in.',
    buyer: 'DISPLAY ONLY',
  },
  {
    code: 'no_box',
    label: 'No box / tags',
    seller: 'No original box or tags, where the condition would normally imply them.',
    buyer: 'NO BOX / TAGS',
  },
] as const;

export type DisclosureTagCode = (typeof DISCLOSURE_TAGS)[number]['code'];

const CODES = new Set<string>(DISCLOSURE_TAGS.map((t) => t.code));

/** Whitelist, dedupe, and order like DISCLOSURE_TAGS. Non-arrays return undefined (field untouched). */
export function normalizeDisclosureTags(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const given = new Set(
    input.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase())
  );
  return DISCLOSURE_TAGS.filter((t) => given.has(t.code)).map((t) => t.code);
}

export function disclosureTagByCode(code: string) {
  return DISCLOSURE_TAGS.find((t) => t.code === code) ?? null;
}

/** Prompt lines for pricing: a disclosed modification changes what comps apply. */
export function disclosurePricingLines(tags: string[] | null | undefined): string[] {
  const valid = (tags ?? []).filter((t) => CODES.has(t));
  if (!valid.length) return [];
  const labels = valid.map((t) => disclosureTagByCode(t)?.label ?? t).join(', ');
  return [
    `Seller disclosures: ${labels}. A custom-painted, custom-built, or sole-swapped pair is priced as modified work, not against stock sold comps; display-only vintage prices as a collector piece, not a wearable shoe.`,
  ];
}
