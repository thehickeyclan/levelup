import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { getSellerProfile } from '@/lib/market/seller';
import { fetchMarketSellerStats } from '@/lib/market/seller-reputation';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: listing, error } = await supabase
    .from('market_listings')
    .select(`
      *,
      market_listing_images(id, public_url, display_order),
      market_ai_analysis(*)
    `)
    .eq('id', id)
    .maybeSingle();

  if (error || !listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const isOwner = listing.seller_id === user!.id;
  if (!isOwner && listing.status !== 'active' && listing.status !== 'sold' && listing.status !== 'traded') {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const seller = await getSellerProfile(supabase, listing.seller_id);
  const sellerStats = seller
    ? await fetchMarketSellerStats(supabase, listing.seller_id as string)
    : null;

  const { count: pendingOfferCount } = await supabase
    .from('market_offers')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', id)
    .eq('status', 'pending');

  let displayViews = listing.views_count ?? 0;
  if (listing.status === 'active' && !isOwner && listing.listing_type !== 'collection') {
    displayViews += 1;
    await supabase
      .from('market_listings')
      .update({ views_count: displayViews })
      .eq('id', id);
  }

  const aiAssisted = Boolean(
    (listing.market_ai_analysis as { analyzed_at?: string } | null)?.analyzed_at
  );

  const publicListing = isOwner
    ? { ...listing, views_count: displayViews, ai_assisted: aiAssisted }
    : {
        ...listing,
        views_count: displayViews,
        market_ai_analysis: undefined,
        ai_assisted: aiAssisted,
      };

  return NextResponse.json({
    listing: publicListing,
    seller: seller ? { ...seller, school: seller.school } : seller,
    sellerStats,
    pending_offer_count: pendingOfferCount ?? 0,
    viewer: { id: user!.id, isSeller: isOwner },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: existing } = await supabase
    .from('market_listings')
    .select('seller_id, status')
    .eq('id', id)
    .single();

  if (!existing || existing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const allowed = [
    'title', 'brand', 'model', 'size', 'condition', 'price_cents', 'shipping_cents',
    'listing_type', 'open_to_trade', 'open_to_boot', 'description', 'weight_class', 'model_year', 'wear_state', 'status',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (updates.status === 'active') {
    const { count } = await supabase
      .from('market_listing_images')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', id);
    if (!count || count < 1) {
      return NextResponse.json({ error: 'Add at least one photo before publishing.' }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from('market_listings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id } = await params;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id')
    .eq('id', id)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: images } = await supabase
    .from('market_listing_images')
    .select('storage_path')
    .eq('listing_id', id);

  if (images?.length) {
    await supabase.storage.from('market-listing-photos').remove(images.map((i) => i.storage_path));
  }

  await supabase.from('market_listings').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
