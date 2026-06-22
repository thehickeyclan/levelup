import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { reorderListingImagesForPrimary } from '@/lib/market/listing-images';
import { normalizeListingImageOrders } from '@/lib/market/normalize-listing-image-orders';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id: listingId, imageId } = await params;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: rows, error: fetchErr } = await supabase
    .from('market_listing_images')
    .select('id, display_order')
    .eq('listing_id', listingId);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!rows?.some((r) => r.id === imageId)) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  const reordered = reorderListingImagesForPrimary(rows, imageId);
  const admin = createAdminClient(tenant.slug);

  for (const row of reordered) {
    const { error } = await admin
      .from('market_listing_images')
      .update({ display_order: row.display_order })
      .eq('id', row.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await normalizeListingImageOrders(admin, listingId);

  const { data: normalized } = await admin
    .from('market_listing_images')
    .select('id, display_order')
    .eq('listing_id', listingId)
    .order('display_order', { ascending: true });

  return NextResponse.json({
    images: (normalized ?? reordered).map((r) => ({ id: r.id, display_order: r.display_order })),
  });
}
