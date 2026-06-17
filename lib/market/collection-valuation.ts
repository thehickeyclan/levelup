import type { SupabaseClient } from '@supabase/supabase-js';

export type CollectionValuation = {
  total_cents: number;
  pairs_with_estimates: number;
  collection_count: number;
  updated_at: string | null;
};

/** Sum AI mid-price estimates for a seller's active collection listings. */
export async function fetchCollectionValuation(
  supabase: SupabaseClient,
  sellerId: string
): Promise<CollectionValuation | null> {
  const { data: listings } = await supabase
    .from('market_listings')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('listing_type', 'collection')
    .eq('status', 'active');

  const ids = (listings ?? []).map((l) => l.id as string);
  if (!ids.length) return null;

  const { data: aiRows } = await supabase
    .from('market_ai_analysis')
    .select('listing_id, price_suggested_mid_cents, analyzed_at')
    .in('listing_id', ids)
    .not('price_suggested_mid_cents', 'is', null);

  const rows = aiRows ?? [];
  if (!rows.length) return null;

  let total = 0;
  let latest: string | null = null;
  for (const row of rows) {
    total += Number(row.price_suggested_mid_cents) || 0;
    const at = row.analyzed_at as string | null;
    if (at && (!latest || at > latest)) latest = at;
  }

  return {
    total_cents: total,
    pairs_with_estimates: rows.length,
    collection_count: ids.length,
    updated_at: latest,
  };
}
