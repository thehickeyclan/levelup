import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MARKET_LISTING_IMAGE_FIELDS_WITH_ID } from '@/lib/market/listing-images';
import { normalizeListingImageOrders } from '@/lib/market/normalize-listing-image-orders';

/** Renumber listing photos 0..n-1 after batch uploads or cover changes. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id: listingId } = await params;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient(tenant.slug);
  await normalizeListingImageOrders(admin, listingId);

  const { data: images, error } = await admin
    .from('market_listing_images')
    .select(MARKET_LISTING_IMAGE_FIELDS_WITH_ID)
    .eq('listing_id', listingId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ images: images ?? [] });
}
