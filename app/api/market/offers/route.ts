import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { createNotification } from '@/lib/notifications';
import { normalizePhone, sendSms } from '@/lib/twilio';

function buyerLabel(firstName: string | null | undefined): string {
  const n = firstName?.trim();
  return n || 'A buyer';
}

const OFFER_TYPES = ['cash', 'trade', 'cash_and_trade'] as const;
type OfferType = (typeof OFFER_TYPES)[number];

function parseOfferType(raw: unknown): OfferType | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw === 'cash_and_trade' ? 'cash_and_trade' : raw;
  return OFFER_TYPES.includes(normalized as OfferType) ? (normalized as OfferType) : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
        market_listings(id, title, brand, model, market_listing_images(public_url, display_order))
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
      market_listings(id, title, brand, model, market_listing_images(public_url, display_order))
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
      buyerNames.set(b.id as string, buyerLabel(b.first_name as string));
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

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const listingId = String(body.listingId ?? body.listing_id ?? '').trim();
  if (!listingId || !isUuid(listingId)) {
    return NextResponse.json({ error: 'listingId required' }, { status: 400 });
  }

  const offerType = parseOfferType(body.offerType) ?? parseOfferType(body.offer_type);
  if (!offerType) {
    return NextResponse.json({ error: 'Invalid offer type' }, { status: 400 });
  }

  const rawAmount = body.amountCents ?? body.amount_cents;
  const amountCents =
    rawAmount != null && rawAmount !== '' ? Math.round(Number(rawAmount)) : null;

  const tradeListingId = String(body.tradeListingId ?? body.trade_listing_id ?? '').trim() || null;
  const messageRaw = typeof body.message === 'string' ? body.message.trim() : '';
  const message = messageRaw ? messageRaw.slice(0, 200) : null;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('id, seller_id, status, listing_type, title, brand, model, price_cents')
    .eq('id', listingId)
    .single();

  if (!listing || listing.status !== 'active') {
    return NextResponse.json({ error: 'Listing not available' }, { status: 404 });
  }
  if (listing.seller_id === user!.id) {
    return NextResponse.json({ error: 'Cannot offer on your own listing' }, { status: 403 });
  }

  if (offerType === 'cash' || offerType === 'cash_and_trade') {
    if (!amountCents || amountCents < 100) {
      return NextResponse.json({ error: 'Enter a valid offer amount (minimum $1)' }, { status: 400 });
    }
  } else {
    // trade-only: amount optional
  }

  if (offerType === 'trade' || offerType === 'cash_and_trade') {
    if (!tradeListingId || !isUuid(tradeListingId)) {
      return NextResponse.json({ error: 'Select a listing to trade' }, { status: 400 });
    }
    if (tradeListingId === listingId) {
      return NextResponse.json({ error: 'Cannot trade the same listing' }, { status: 400 });
    }
    const { data: tradeListing } = await supabase
      .from('market_listings')
      .select('id, seller_id, status')
      .eq('id', tradeListingId)
      .maybeSingle();
    if (!tradeListing || tradeListing.seller_id !== user!.id || tradeListing.status !== 'active') {
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
  const listingLabel = [listing.brand, listing.model].filter(Boolean).join(' ') || listing.title;

  const insertAmount =
    offerType === 'trade' ? null : amountCents;
  const insertTradeId =
    offerType === 'cash' ? null : tradeListingId;

  const { data, error } = await admin
    .from('market_offers')
    .insert({
      tenant_slug: tenant.slug,
      listing_id: listingId,
      buyer_id: user!.id,
      offer_type: offerType,
      amount_cents: insertAmount,
      trade_listing_id: insertTradeId,
      message,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ data: buyerRow }, { data: sellerRow }] = await Promise.all([
    admin.from('users').select('first_name').eq('id', user!.id).maybeSingle(),
    admin.from('users').select('phone, first_name').eq('id', listing.seller_id).maybeSingle(),
  ]);

  const buyerName = buyerLabel(buyerRow?.first_name as string | null);
  const offerSummary =
    offerType === 'cash' && amountCents
      ? `${buyerName} offered $${(amountCents / 100).toFixed(0)} on ${listingLabel}`
      : offerType === 'trade'
        ? `${buyerName} sent a trade offer on ${listingLabel}`
        : `${buyerName} sent a cash + trade offer on ${listingLabel}`;

  await createNotification(admin, {
    user_id: listing.seller_id,
    type: 'market_vault_offer',
    title: offerType === 'trade' ? 'New trade offer' : 'New offer on your listing',
    body: offerSummary,
    data: {
      listing_id: listingId,
      offer_id: data.id,
      link: '/market/offers',
    },
  });

  const sellerPhone = normalizePhone(sellerRow?.phone as string | null | undefined);
  if (sellerPhone) {
    void sendSms(
      sellerPhone,
      `The Guild: New offer on your ${listingLabel} in Guild Market. Open the app to review.`,
      {
        admin,
        messageType: 'market_vault_offer',
        recipientId: listing.seller_id as string,
        recipientLabel: sellerRow?.first_name as string | undefined,
      }
    );
  }

  return NextResponse.json({ success: true, offerId: data.id }, { status: 201 });
}
