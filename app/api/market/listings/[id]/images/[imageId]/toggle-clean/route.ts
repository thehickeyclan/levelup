import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id: listingId, imageId } = await params;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { useClean?: boolean };
  const useClean = body.useClean === true;

  const { data: image } = await supabase
    .from('market_listing_images')
    .select('id, clean_public_url')
    .eq('id', imageId)
    .eq('listing_id', listingId)
    .single();

  if (!image) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  if (useClean && !image.clean_public_url) {
    return NextResponse.json({ error: 'No clean version available' }, { status: 400 });
  }

  const { error } = await supabase
    .from('market_listing_images')
    .update({ use_clean: useClean })
    .eq('id', imageId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, useClean });
}
