import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { createNotification } from '@/lib/notifications';
import { notifyListingFollowers } from '@/lib/market/notify-listing-followers';
import { marketOfferPostSchema } from '@/lib/market/offer-schemas';
import { listingAllowsCashOffer, listingAllowsTradeOffer } from '@/lib/market/accepts-offers';
import { findOrCreateThread } from '@/lib/guild-messaging';
import { normalizePhone, sendSms } from '@/lib/twilio';

function buyerFirstName(firstName: string | null | undefined): string {
  const n = firstName?.trim();
  return n || 'Someone';
}

/** GET — incoming offers (seller) or sent offers (buyer). POST — submit offer. */
export async function GET(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;

  const mode = req.nextUrl.searchParams.get('mode') || 'incoming';

  if (mode === 'sent') {
    const { data, error } = await supabase
      .from('market_offers')
      .select(`
        id, offer_type, amount_cents, message, status, created_at, expires_at, listing_id,
        market_listings(id, title, brand, model, market_listing_images(public_url, clean_public_url, use_clean, display_order))
      `)
      .eq('buyer_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ offers: data ?? [] });
  }

  const { data: myListings } = await supabase
    .from('market_listings')
    .select('id')
    .eq('seller_id', user!.id);

  const listingIds = (myListings ?? []).map((l) => l.id);
  if (!listingIds.length) {
    return NextResponse.json({ offers: [], pending_count: 0 });
  }

  const { data, error } = await supabase
    .from('market_offers')
    .select(`
      id, offer_type, amount_cents, message, status, created_at, expires_at, listing_id, buyer_id,
      market_listings(id, title, brand, model, market_listing_images(public_url, clean_public_url, use_clean, display_order))
    `)
    .in('listing_id', listingIds)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const offers = data ?? [];
  const pendingCount = offers.filter((o) => o.status === 'pending').length;

  const buyerIds = [...new Set(offers.map((o) => o.buyer_id as string))];
  const buyerNames = new Map<string, string>();
  if (buyerIds.length) {
    const { data: buyers } = await supabase
      .from('users')
      .select('id, first_name')
      .in('id', buyerIds);
    for (const b of buyers ?? []) {
      buyerNames.set(b.id as string, buyerFirstName(b.first_name as string));
    }
  }

  const enriched = offers.map((o) => ({
    ...o,
    buyer_label: buyerNames.get(o.buyer_id as string) ?? 'Buyer',
  }));

  return NextResponse.json({ offers: enriched, pending_count: pendingCount });
}

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);

  const rawBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = marketOfferPostSchema.safeParse({
    listingId: rawBody.listingId ?? rawBody.listing_id,
    offerType: rawBody.offerType ?? rawBody.offer_type,
    amountCents:
      rawBody.amountCents != null || rawBody.amount_cents != null
        ? Math.round(Number(rawBody.amountCents ?? rawBody.amount_cents))
        : undefined,
    tradeListingId: rawBody.tradeListingId ?? rawBody.trade_listing_id ?? undefined,
    message: typeof rawBody.message === 'string' ? rawBody.message.trim() : undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { listingId, offerType, amountCents, tradeListingId, message } = parsed.data;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('id, seller_id, status, listing_type, title, brand, model, price_cents, locked_buyer_id, accepts_offers, open_to_trade')
    .eq('id', listingId)
    .single();

  if (!listing || listing.status !== 'active') {
    return NextResponse.json({ error: 'Listing not available' }, { status: 404 });
  }
  if (listing.locked_buyer_id) {
    return NextResponse.json(
      { error: 'This pair is tied up in a pending trade or checkout.' },
      { status: 409 }
    );
  }
  if (listing.seller_id === user!.id) {
    return NextResponse.json({ error: 'Cannot offer on your own listing' }, { status: 403 });
  }
  if (listing.listing_type === 'collection') {
    return NextResponse.json({ error: 'This pair is not for sale' }, { status: 400 });
  }

  const cashOffer = offerType === 'cash' || offerType === 'cash_and_trade';
  const tradeOffer = offerType === 'trade' || offerType === 'cash_and_trade';

  if (cashOffer && !listingAllowsCashOffer(listing)) {
    return NextResponse.json({ error: 'This listing does not accept cash offers' }, { status: 400 });
  }
  if (tradeOffer && !listingAllowsTradeOffer(listing)) {
    return NextResponse.json({ error: 'This listing is not open to trades' }, { status: 400 });
  }

  if (offerType === 'trade' || offerType === 'cash_and_trade') {
    if (tradeListingId === listingId) {
      return NextResponse.json({ error: 'Cannot trade the same listing' }, { status: 400 });
    }
    const { data: tradeListing } = await supabase
      .from('market_listings')
      .select('id, seller_id, status, locked_buyer_id')
      .eq('id', tradeListingId!)
      .maybeSingle();
    if (
      !tradeListing ||
      tradeListing.seller_id !== user!.id ||
      tradeListing.status !== 'active' ||
      tradeListing.locked_buyer_id
    ) {
      return NextResponse.json({ error: 'Trade listing not available' }, { status: 403 });
    }
  }

  const { data: existingPending } = await admin
    .from('market_offers')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', user!.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingPending) {
    return NextResponse.json(
      { error: 'You already have a pending offer on this listing' },
      { status: 409 }
    );
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const insertAmount = offerType === 'trade' ? null : amountCents ?? null;
  const insertTradeId = offerType === 'cash' ? null : tradeListingId ?? null;
  const insertMessage = message?.trim() ? message.trim().slice(0, 200) : null;

  const { data, error } = await admin
    .from('market_offers')
    .insert({
      tenant_slug: tenant.slug,
      listing_id: listingId,
      buyer_id: user!.id,
      offer_type: offerType,
      amount_cents: insertAmount,
      trade_listing_id: insertTradeId,
      message: insertMessage,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await findOrCreateThread(admin, {
    threadType: 'offer',
    tenantSlug: tenant.slug,
    participantIds: [user!.id, listing.seller_id as string],
    listingId,
    offerId: data.id as string,
  });

  const [{ data: buyerRow }, { data: sellerRow }] = await Promise.all([
    admin.from('users').select('first_name').eq('id', user!.id).maybeSingle(),
    admin.from('users').select('phone, first_name').eq('id', listing.seller_id).maybeSingle(),
  ]);

  const buyerName = buyerFirstName(buyerRow?.first_name as string | null);
  const listingTitle = (listing.title as string) || 'listing';

  await createNotification(admin, {
    user_id: listing.seller_id,
    type: 'market_vault_offer',
    title: 'New offer on your listing',
    body: `${buyerName} made an offer on ${listingTitle}`,
    data: {
      listingId,
      offerId: data.id,
      listing_id: listingId,
      offer_id: data.id,
      link: '/market/offers',
    },
  });

  const sellerPhone = normalizePhone(sellerRow?.phone as string | null | undefined);
  if (sellerPhone) {
    void sendSms(
      sellerPhone,
      `New offer on your ${listingTitle} in Guild Market. Open the app to review.`,
      {
        admin,
        messageType: 'market_vault_offer',
        recipientId: listing.seller_id as string,
        recipientLabel: sellerRow?.first_name as string | undefined,
      }
    );
  }

  const { count: pendingCount } = await admin
    .from('market_offers')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
    .eq('status', 'pending');

  void notifyListingFollowers(
    tenant.slug,
    {
      id: listingId,
      seller_id: listing.seller_id as string,
      title: listing.title as string,
      brand: listing.brand as string,
      model: listing.model as string,
    },
    { type: 'new_offer', pendingCount: pendingCount ?? 1 },
    { excludeUserIds: [user!.id, listing.seller_id as string] }
  );

  return NextResponse.json({ success: true, offerId: data.id }, { status: 201 });
}
