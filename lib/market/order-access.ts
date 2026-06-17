import type { SupabaseClient } from '@supabase/supabase-js';

export async function getMarketOrderForUser(
  supabase: SupabaseClient,
  orderId: string,
  userId: string
) {
  const { data: order, error } = await supabase
    .from('market_orders')
    .select(`
      id, order_ref, status, amount_cents, shipping_cents, created_at, updated_at,
      listing_id, buyer_id, seller_id,
      shipping_address, shipping_carrier, tracking_number,
      shipping_label_storage_path,
      shipped_at, delivered_at,
      market_listings(id, title, brand, model, size, market_listing_images(public_url, display_order))
    `)
    .eq('id', orderId)
    .maybeSingle();

  if (error || !order) return null;
  if (order.buyer_id !== userId && order.seller_id !== userId) return null;
  return order;
}

export function orderRole(order: { buyer_id: string; seller_id: string }, userId: string): 'buyer' | 'seller' | null {
  if (order.buyer_id === userId) return 'buyer';
  if (order.seller_id === userId) return 'seller';
  return null;
}
