import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { getSellerProfile } from '@/lib/market/seller';
import { fetchMarketSellerStats } from '@/lib/market/seller-reputation';
import { notifySellerDropFollowers } from '@/lib/market/notify-seller-drop';
import {
  detectListingFollowEvents,
  notifyListingFollowers,
} from '@/lib/market/notify-listing-followers';
import { MARKET_LISTING_IMAGE_FIELDS_WITH_ID } from '@/lib/market/listing-images';
import { isMissingColumnError, withoutColorFamily } from '@/lib/market/listing-column-fallback';
import type { SupabaseClient } from '@supabase/supabase-js';

async function applyListingUpdate(
  supabase: SupabaseClient,
  id: string,
  updates: Record<string, unknown>
) {
  let result = await supabase.from('market_listings').update(updates).eq('id', id).select().single();
  if (result.error && isMissingColumnError(result.error.message, 'color_family') && 'color_family' in updates) {
    result = await supabase
      .from('market_listings')
      .update(withoutColorFamily(updates))
      .eq('id', id)
      .select()
      .single();
  }
  return result;
}

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
      market_listing_images(${MARKET_LISTING_IMAGE_FIELDS_WITH_ID}),
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

  const { count: followerCount } = await supabase
    .from('market_listing_follows')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', id);

  let following = false;
  if (!isOwner) {
    const { data: followRow } = await supabase
      .from('market_listing_follows')
      .select('id')
      .eq('listing_id', id)
      .eq('follower_id', user!.id)
      .maybeSingle();
    following = Boolean(followRow);
  }

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
    following,
    follower_count: followerCount ?? 0,
    viewer: { id: user!.id, isSeller: isOwner },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id } = await params;

  const { data: existing } = await supabase
    .from('market_listings')
    .select('seller_id, status, listing_type, title, brand, model, price_cents')
    .eq('id', id)
    .single();

  if (!existing || existing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const allowed = [
    'title', 'brand', 'model', 'size', 'condition', 'price_cents', 'shipping_cents',
    'listing_type', 'open_to_trade', 'open_to_boot', 'description', 'weight_class', 'model_year', 'wear_state', 'status', 'colorway', 'color_family',
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

  const { data, error } = await applyListingUpdate(supabase, id, updates);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const prevType = existing.listing_type as string;
  const nextType = (updates.listing_type ?? prevType) as string;
  const prevStatus = existing.status as string;
  const nextStatus = (updates.status ?? prevStatus) as string;
  const prevPrice = existing.price_cents as number | null | undefined;
  const nextPrice = (updates.price_cents ?? prevPrice) as number | null | undefined;

  const listingMeta = {
    id: data.id as string,
    seller_id: existing.seller_id as string,
    title: data.title as string,
    brand: data.brand as string,
    model: data.model as string,
  };

  const followEvents = detectListingFollowEvents(
    { listing_type: prevType, status: prevStatus, price_cents: prevPrice },
    { listing_type: nextType, status: nextStatus, price_cents: nextPrice }
  );
  for (const event of followEvents) {
    void notifyListingFollowers(tenant.slug, listingMeta, event);
  }

  if (
    prevType === 'collection' &&
    updates.listing_type &&
    (updates.listing_type === 'vault' || updates.listing_type === 'sell') &&
    data
  ) {
    void notifySellerDropFollowers(tenant.slug, existing.seller_id as string, {
      id: data.id as string,
      title: data.title as string,
      brand: data.brand as string,
      model: data.model as string,
      listing_type: nextType,
    });
  }

  return NextResponse.json({ listing: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);
  const { id } = await params;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id, status')
    .eq('id', id)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { count: pendingOfferCount } = await admin
    .from('market_offers')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', id)
    .eq('status', 'pending');

  if (pendingOfferCount && pendingOfferCount > 0) {
    return NextResponse.json(
      { error: 'Resolve pending offers before deleting this listing.' },
      { status: 409 }
    );
  }

  const { count: openOrderCount } = await admin
    .from('market_orders')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', id)
    .in('status', ['pending_payment', 'paid', 'shipped']);

  if (openOrderCount && openOrderCount > 0) {
    return NextResponse.json(
      { error: 'This listing has an order in progress and cannot be deleted.' },
      { status: 409 }
    );
  }

  const { data: images } = await admin
    .from('market_listing_images')
    .select('storage_path, clean_storage_path')
    .eq('listing_id', id);

  const paths: string[] = [];
  for (const img of images ?? []) {
    if (img.storage_path) paths.push(img.storage_path as string);
    if (img.clean_storage_path) paths.push(img.clean_storage_path as string);
  }
  if (paths.length) {
    await admin.storage.from('market-listing-photos').remove(paths);
  }

  const { data: deleted, error } = await admin
    .from('market_listings')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    console.error('market listing DELETE:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!deleted?.length) {
    return NextResponse.json({ error: 'Could not delete listing' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
