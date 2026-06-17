import { NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';

export async function GET() {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;

  const { data, error } = await supabase
    .from('market_orders')
    .select(`
      id, order_ref, status, amount_cents, shipping_cents, created_at, listing_id, buyer_id, seller_id,
      market_listings(title, brand, model),
      market_seller_reviews(id, rating)
    `)
    .or(`buyer_id.eq.${user!.id},seller_id.eq.${user!.id}`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orders = (data ?? []).map((row) => {
    const listing = row.market_listings as { title?: string; brand?: string; model?: string } | null;
    const review = row.market_seller_reviews as { id?: string; rating?: number } | { id?: string; rating?: number }[] | null;
    const reviewRow = Array.isArray(review) ? review[0] : review;
    return {
      id: row.id,
      order_ref: row.order_ref,
      status: row.status,
      amount_cents: row.amount_cents,
      shipping_cents: row.shipping_cents,
      created_at: row.created_at,
      listing_id: row.listing_id,
      buyer_id: row.buyer_id,
      seller_id: row.seller_id,
      listing_title: listing?.title || [listing?.brand, listing?.model].filter(Boolean).join(' ') || 'Listing',
      is_buyer: row.buyer_id === user!.id,
      review_id: reviewRow?.id ?? null,
      review_rating: reviewRow?.rating ?? null,
      can_review: row.buyer_id === user!.id && row.status === 'completed' && !reviewRow?.id,
    };
  });

  return NextResponse.json({ orders });
}
