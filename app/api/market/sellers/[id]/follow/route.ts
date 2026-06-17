import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id: sellerId } = await params;

  if (sellerId === user!.id) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
  }

  const { data: seller } = await supabase.from('users').select('id').eq('id', sellerId).maybeSingle();
  if (!seller) {
    return NextResponse.json({ error: 'Seller not found' }, { status: 404 });
  }

  const { error } = await supabase.from('market_seller_follows').upsert(
    { follower_id: user!.id, seller_id: sellerId },
    { onConflict: 'follower_id,seller_id' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, following: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id: sellerId } = await params;

  const { error } = await supabase
    .from('market_seller_follows')
    .delete()
    .eq('follower_id', user!.id)
    .eq('seller_id', sellerId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, following: false });
}
