import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id: listingId } = await params;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('id, seller_id, status')
    .eq('id', listingId)
    .maybeSingle();

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (listing.seller_id === user!.id) {
    return NextResponse.json({ error: 'Cannot follow your own listing' }, { status: 400 });
  }

  const visible =
    listing.status === 'active' || listing.status === 'sold' || listing.status === 'traded';
  if (!visible) {
    return NextResponse.json({ error: 'Listing not available' }, { status: 404 });
  }

  const { error } = await supabase.from('market_listing_follows').upsert(
    { follower_id: user!.id, listing_id: listingId },
    { onConflict: 'follower_id,listing_id' }
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
  const { id: listingId } = await params;

  const { error } = await supabase
    .from('market_listing_follows')
    .delete()
    .eq('follower_id', user!.id)
    .eq('listing_id', listingId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, following: false });
}
