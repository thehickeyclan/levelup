import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id: listingId, imageId } = await params;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id, status')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: image } = await supabase
    .from('market_listing_images')
    .select('id, storage_path, clean_storage_path')
    .eq('id', imageId)
    .eq('listing_id', listingId)
    .maybeSingle();

  if (!image) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  if (listing.status === 'active') {
    const { count } = await supabase
      .from('market_listing_images')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Active listings need at least one photo — add another before removing this one.' },
        { status: 400 }
      );
    }
  }

  const admin = createAdminClient(tenant.slug);
  const paths = [image.storage_path, image.clean_storage_path].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  );
  if (paths.length) {
    await admin.storage.from('market-listing-photos').remove(paths);
  }

  const { error } = await supabase.from('market_listing_images').delete().eq('id', imageId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
