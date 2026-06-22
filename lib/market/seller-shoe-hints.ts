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

  return `
SELLER LISTING HISTORY (weak background only — current photos are ground truth):
This seller has listed these pairs before. Use history only when the photos clearly match that
brand/model (logo, sole tread, panel construction). If photos show a different brand or model,
trust the photos — do NOT default to history. Bird logos appear on RUDIS, Cronin, and others;
identify from sole tread and panel shape, not mascot alone.
${lines.join('\n')}
`;
}
