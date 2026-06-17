import { NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';

export async function GET() {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;

  const { data, error } = await supabase
    .from('market_orders')
    .select('id, order_ref, status, amount_cents, shipping_cents, created_at, listing_id, buyer_id, seller_id')
    .or(`buyer_id.eq.${user!.id},seller_id.eq.${user!.id}`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}
