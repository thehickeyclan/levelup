import { NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { fetchMyListings } from '@/lib/market/my-listings-data';
import { primaryListingImageUrl } from '@/lib/market/listing-images';

export async function GET() {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const userId = user!.id;

  const [groups, followsResult, ordersResult] = await Promise.all([
    fetchMyListings(supabase, userId),
    supabase
      .from('market_listing_follows')
      .select('listing_id, created_at')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('market_orders')
      .select(`
        id, order_ref, status, amount_cents, created_at, listing_id, buyer_id, seller_id,
        market_listings(title, brand, model, market_listing_images(public_url, clean_public_url, use_clean, display_order))
      `)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const followedIds = (followsResult.data ?? [])
    .map((follow) => follow.listing_id as string)
    .filter(Boolean);
  const { data: followedListings } = followedIds.length
    ? await supabase
        .from('market_listings')
        .select(`
          id, title, brand, model, size, condition, wear_state, status, listing_type,
          price_cents, open_to_trade,
          market_listing_images(public_url, clean_public_url, use_clean, display_order)
        `)
        .in('id', followedIds)
    : { data: [] };
  const followedById = new Map((followedListings ?? []).map((listing) => [listing.id as string, listing]));
  const watching = followedIds
    .map((listingId) => followedById.get(listingId))
    .filter(Boolean)
    .map((listing) => ({
      ...listing,
      primary_image_url: primaryListingImageUrl(
        listing!.market_listing_images as Parameters<typeof primaryListingImageUrl>[0]
      ),
    }));

  const orders = (ordersResult.data ?? []).map((order) => {
    const listing = order.market_listings as {
      title?: string;
      brand?: string;
      model?: string;
      market_listing_images?: Parameters<typeof primaryListingImageUrl>[0];
    } | null;
    return {
      id: order.id,
      order_ref: order.order_ref,
      status: order.status,
      amount_cents: order.amount_cents,
      created_at: order.created_at,
      listing_id: order.listing_id,
      listing_title:
        listing?.title ||
        [listing?.brand, listing?.model].filter(Boolean).join(' ') ||
        'Marketplace order',
      listing_image_url: primaryListingImageUrl(listing?.market_listing_images ?? null),
      is_buyer: order.buyer_id === userId,
    };
  });

  return NextResponse.json({ groups, watching, orders });
}
