import type { SupabaseClient } from '@supabase/supabase-js';

export type SellerShoeHint = {
  brand: string;
  model: string;
  colorway: string | null;
  model_year: number | null;
};

/** Recent listings from this seller — used to bias Shoe ID (not training, just context). */
export async function fetchSellerShoeHints(
  supabase: SupabaseClient,
  sellerId: string,
  limit = 8
): Promise<SellerShoeHint[]> {
  const { data } = await supabase
    .from('market_listings')
    .select('brand, model, colorway, model_year')
    .eq('seller_id', sellerId)
    .not('model', 'is', null)
    .neq('model', '')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? [])
    .map((row) => ({
      brand: String(row.brand ?? '').trim(),
      model: String(row.model ?? '').trim(),
      colorway: typeof row.colorway === 'string' ? row.colorway.trim() || null : null,
      model_year:
        typeof row.model_year === 'number' && Number.isFinite(row.model_year)
          ? row.model_year
          : null,
    }))
    .filter((row) => row.brand && row.model);
}

export function dominantSellerBrand(hints: SellerShoeHint[]): string | null {
  const counts = new Map<string, number>();
  for (const h of hints) {
    counts.set(h.brand, (counts.get(h.brand) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [brand, count] of counts) {
    if (count > bestCount) {
      best = brand;
      bestCount = count;
    }
  }
  return best;
}

function listingKey(h: SellerShoeHint): string {
  return `${h.brand.toLowerCase()}|${h.model.toLowerCase()}`;
}

/** Most-listed brand+model for this seller (recent order breaks ties). */
export function dominantSellerListing(hints: SellerShoeHint[]): SellerShoeHint | null {
  if (!hints.length) return null;

  const counts = new Map<string, number>();
  const byKey = new Map<string, SellerShoeHint>();
  for (const h of hints) {
    const key = listingKey(h);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!byKey.has(key)) byKey.set(key, h);
  }

  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }

  return bestKey ? (byKey.get(bestKey) ?? null) : null;
}

export function formatSellerShoeHintsForPrompt(hints: SellerShoeHint[]): string {
  if (!hints.length) return '';

  const lines = hints.map((h) => {
    const cw = h.colorway ? ` · ${h.colorway}` : '';
    const yr = h.model_year ? ` (${h.model_year})` : '';
    return `- ${h.brand} ${h.model}${yr}${cw}`;
  });

  const dominant = dominantSellerListing(hints);
  const lockNote =
    dominant && (hints.filter((h) => h.brand.toLowerCase() === dominant.brand.toLowerCase()).length >= 2)
      ? `
STRONG PRIOR: This seller has listed ${dominant.brand} ${dominant.model} multiple times. Unless the photos
clearly show a different brand (different logo, sole, or construction), treat this as another colorway of
${dominant.brand} ${dominant.model}. Do NOT swap to RUDIS, Adidas, or another brand because of a bird logo
or similar graphic — Cronin uses bird imagery; trust seller history and sole/panel construction.
`
      : '';

  return `
SELLER LISTING HISTORY (same person uploading now — strong prior, not ground truth):
They have listed these pairs before. If the photos look like the same model line, prefer matching
brand/model from this history over a generic guess (e.g. do not swap Cronin for RUDIS when history is Cronin).
${lines.join('\n')}
${lockNote}`;
}
