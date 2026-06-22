import type { SupabaseClient } from '@supabase/supabase-js';

/** Renumber display_order to 0..n-1 (stable by display_order, then created_at). */
export async function normalizeListingImageOrders(
  supabase: SupabaseClient,
  listingId: string
): Promise<void> {
  const { data: rows, error } = await supabase
    .from('market_listing_images')
    .select('id, display_order, created_at')
    .eq('listing_id', listingId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !rows?.length) return;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (Number(row.display_order) === i) continue;
    await supabase.from('market_listing_images').update({ display_order: i }).eq('id', row.id);
  }
}
