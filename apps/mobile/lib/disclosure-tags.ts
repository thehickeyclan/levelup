/**
 * Mandatory disclosure tags — docs/market-listing-standards.md §3.
 * Codes must match lib/market/disclosure-tags.ts on the web side.
 * REPLICA ships later, locked to the Replica/Tribute category (§5.2).
 */
export const DISCLOSURE_TAGS = [
  { code: 'sole_swapped', label: 'Sole swapped', seller: 'Soles have been replaced. Legit work — buyers just need to know.' },
  { code: 'repaired', label: 'Repaired', seller: 'Stitching, re-gluing, a patch, or any structural repair.' },
  { code: 'custom_painted', label: 'Custom painted', seller: 'Any paint or colorway alteration — genuine shoe, aftermarket finish.' },
  { code: 'custom_build', label: 'Custom build', seller: 'A bespoke build, including builds on another model’s upper.' },
  { code: 'mismatched_pair', label: 'Mismatched pair', seller: 'The two shoes differ in colorway, size, or production run.' },
  { code: 'display_only', label: 'Display only', seller: 'Fragile or dry-rotted vintage that should not be wrestled in.' },
  { code: 'no_box', label: 'No box / tags', seller: 'No original box or tags, where the condition would normally imply them.' },
] as const;

export function disclosureLabel(code: string): string {
  return DISCLOSURE_TAGS.find((t) => t.code === code)?.label ?? code;
}
