import type { ColorwayProfile, SaleComp } from '@/lib/market/shoe-id/schemas';

export const COLORWAY_AVAILABILITY_LABELS: Record<ColorwayProfile['availability'], string> = {
  current_retail: 'Current retail (in stores)',
  discontinued: 'Discontinued',
  limited: 'Limited release',
  grail: 'Grail / collector',
  unknown: 'Unknown',
};

export function normalizeColorwayName(name: string): string {
  return name.trim().toLowerCase();
}

export function parseColorwayProfiles(raw: unknown): ColorwayProfile[] {
  if (!Array.isArray(raw)) return [];
  const result: ColorwayProfile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    const availability = row.availability as ColorwayProfile['availability'];
    result.push({
      name,
      availability:
        availability === 'current_retail' ||
        availability === 'discontinued' ||
        availability === 'limited' ||
        availability === 'grail'
          ? availability
          : 'unknown',
      value_tier:
        row.value_tier === 'common' ||
        row.value_tier === 'uncommon' ||
        row.value_tier === 'rare' ||
        row.value_tier === 'grail'
          ? row.value_tier
          : undefined,
      retail_anchor_cents:
        typeof row.retail_anchor_cents === 'number' ? row.retail_anchor_cents : undefined,
      value_low_cents: typeof row.value_low_cents === 'number' ? row.value_low_cents : undefined,
      value_mid_cents: typeof row.value_mid_cents === 'number' ? row.value_mid_cents : undefined,
      value_high_cents: typeof row.value_high_cents === 'number' ? row.value_high_cents : undefined,
      notes: typeof row.notes === 'string' ? row.notes : undefined,
    });
  }
  return result;
}

export function colorwayNamesFromProfiles(profiles: ColorwayProfile[]): string[] {
  return profiles.map((p) => p.name.trim()).filter(Boolean);
}

export function legacyColorwaysToProfiles(colorways: unknown[] | null | undefined): ColorwayProfile[] {
  if (!colorways?.length) return [];
  return colorways
    .map((c) => (typeof c === 'string' ? c.trim() : String(c).trim()))
    .filter(Boolean)
    .map((name) => ({
      name,
      availability: 'unknown' as const,
    }));
}

export function matchColorwayProfile(
  profiles: ColorwayProfile[] | null | undefined,
  colorwayHint?: string | null
): ColorwayProfile | null {
  if (!profiles?.length || !colorwayHint?.trim()) return null;
  const hint = normalizeColorwayName(colorwayHint);
  const exact = profiles.find((p) => normalizeColorwayName(p.name) === hint);
  if (exact) return exact;
  return (
    profiles.find(
      (p) =>
        hint.includes(normalizeColorwayName(p.name)) ||
        normalizeColorwayName(p.name).includes(hint)
    ) ?? null
  );
}

export function formatColorwayProfilesForContext(profiles: ColorwayProfile[] | null | undefined): string {
  if (!profiles?.length) return '—';
  return profiles
    .map((p) => {
      const bits = [`${p.name} [${p.availability}${p.value_tier ? `, ${p.value_tier}` : ''}]`];
      if (p.retail_anchor_cents) bits.push(`retail $${Math.round(p.retail_anchor_cents / 100)}`);
      if (p.value_low_cents != null && p.value_high_cents != null) {
        bits.push(`collector $${Math.round(p.value_low_cents / 100)}–$${Math.round(p.value_high_cents / 100)}`);
      } else if (p.value_mid_cents != null) {
        bits.push(`collector ~$${Math.round(p.value_mid_cents / 100)}`);
      }
      if (p.notes) bits.push(p.notes);
      return bits.join('; ');
    })
    .join(' | ');
}

export function filterSaleCompsForPricing(
  comps: SaleComp[] | null | undefined,
  colorway?: string | null,
  sizeUs?: number | null
): SaleComp[] {
  if (!comps?.length) return [];
  const colorHint = colorway?.trim();
  const size = sizeUs != null && !Number.isNaN(sizeUs) ? sizeUs : null;

  return comps.filter((c) => {
    if (colorHint && c.colorway) {
      const a = normalizeColorwayName(colorHint);
      const b = normalizeColorwayName(c.colorway);
      if (a !== b && !a.includes(b) && !b.includes(a)) return false;
    }
    if (size != null && c.size_us != null && Math.abs(c.size_us - size) > 1) return false;
    return true;
  });
}

export function formatSaleCompsDetailed(comps: SaleComp[] | null | undefined): string {
  if (!comps?.length) return '—';
  return comps
    .map((c) => {
      const price = `$${Math.round(c.sold_price_cents / 100)}`;
      const condition = c.condition ? `, ${c.condition}` : '';
      const colorway = c.colorway ? `, ${c.colorway}` : '';
      const size = c.size_us != null ? `, size ${c.size_us}` : '';
      const source = c.source ? ` (${c.source})` : '';
      const notes = c.notes ? `: ${c.notes}` : '';
      return `${price}${condition}${colorway}${size}${source}${notes}`;
    })
    .join('; ');
}
