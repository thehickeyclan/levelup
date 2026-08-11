import { NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { fetchMyListings } from '@/lib/market/my-listings-data';
import { primaryListingImageUrl } from '@/lib/market/listing-images';

export async function GET() {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const userId = user!.id;

  const [groups, followsResult, ordersResult, tradesResult] = await Promise.all([
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
    supabase
      .from('market_trades')
      .select(
        'id, status, boot_amount_cents, created_at, initiator_id, receiver_id, initiator_listing_id, receiver_listing_id'
      )
      .or(`initiator_id.eq.${userId},receiver_id.eq.${userId}`)
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

  const tradeListingIds = new Set<string>();
  const tradeUserIds = new Set<string>();
  for (const trade of tradesResult.data ?? []) {
    if (trade.initiator_listing_id) tradeListingIds.add(trade.initiator_listing_id as string);
    if (trade.receiver_listing_id) tradeListingIds.add(trade.receiver_listing_id as string);
    if (trade.initiator_id) tradeUserIds.add(trade.initiator_id as string);
    if (trade.receiver_id) tradeUserIds.add(trade.receiver_id as string);
  }

  const [{ data: tradeListings }, { data: tradeUsers }] = await Promise.all([
    tradeListingIds.size
      ? supabase
          .from('market_listings')
          .select('id, title, brand, model, size, market_listing_images(public_url, clean_public_url, use_clean, display_order)')
          .in('id', [...tradeListingIds])
      : Promise.resolve({ data: [] }),
    tradeUserIds.size
      ? supabase.from('users').select('id, first_name, last_name').in('id', [...tradeUserIds])
      : Promise.resolve({ data: [] }),
  ]);

  const tradeListingMap = new Map(
    (tradeListings ?? []).map((listing) => [
      listing.id as string,
      {
        id: listing.id as string,
        title:
          (listing.title as string | null) ||
          [listing.brand, listing.model].filter(Boolean).join(' ') ||
          'Marketplace pair',
        size: listing.size as number | null,
        image_url: primaryListingImageUrl(
          listing.market_listing_images as Parameters<typeof primaryListingImageUrl>[0]
        ),
      },
    ])
  );
  const tradeUserMap = new Map(
    (tradeUsers ?? []).map((marketUser) => [
      marketUser.id as string,
      [marketUser.first_name, marketUser.last_name].filter(Boolean).join(' ') || 'Guild member',
    ])
  );

  const trades = (tradesResult.data ?? []).map((trade) => {
    const isInitiator = trade.initiator_id === userId;
    const yourListing = tradeListingMap.get(
      (isInitiator ? trade.initiator_listing_id : trade.receiver_listing_id) as string
    );
    const theirListing = tradeListingMap.get(
      (isInitiator ? trade.receiver_listing_id : trade.initiator_listing_id) as string
    );
    const otherUserId = (isInitiator ? trade.receiver_id : trade.initiator_id) as string;
    return {
      id: trade.id,
      status: trade.status,
      boot_amount_cents: trade.boot_amount_cents ?? 0,
      created_at: trade.created_at,
      role: isInitiator ? 'initiator' : 'receiver',
      other_party_name: tradeUserMap.get(otherUserId) ?? 'Guild member',
      your_listing: yourListing ?? null,
      their_listing: theirListing ?? null,
    };
  });

  return NextResponse.json({ groups, watching, orders, trades });
}
