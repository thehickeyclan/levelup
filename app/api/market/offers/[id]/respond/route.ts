import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { calcMarketFees } from '@/lib/market/fees';
import { resolvePayoutRecipientId } from '@/lib/market/seller';
import { createNotification } from '@/lib/notifications';
import { findOrCreateThread } from '@/lib/guild-messaging';
import { lockListingsForTrade } from '@/lib/market/trade-lifecycle';
import { normalizePhone, sendSms } from '@/lib/twilio';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);
  const { id: offerId } = await params;

  const body = (await req.json().catch(() => ({}))) as { action?: 'accept' | 'decline' };
  if (body.action !== 'accept' && body.action !== 'decline') {
    return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 });
  }

  const { data: offer } = await supabase
    .from('market_offers')
    .select(`
      id, buyer_id, listing_id, status, offer_type, amount_cents, trade_listing_id, message,
      market_listings(id, seller_id, title, brand, model, shipping_cents, condition, status)
    `)
    .eq('id', offerId)
    .maybeSingle();

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 });

  const listingRaw = offer.market_listings;
  const listing = (Array.isArray(listingRaw) ? listingRaw[0] : listingRaw) as {
    id: string;
    seller_id: string;
    title: string;
    brand: string;
    model: string;
    shipping_cents: number;
    condition: string;
    status: string;
  } | null;

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (offer.status !== 'pending') {
    return NextResponse.json({ error: 'Offer already handled' }, { status: 400 });
  }

  const listingTitle = listing.title || [listing.brand, listing.model].filter(Boolean).join(' ') || 'listing';

  if (body.action === 'decline') {
    await admin.from('market_offers').update({ status: 'declined' }).eq('id', offerId);
    await createNotification(admin, {
      user_id: offer.buyer_id as string,
      type: 'market_offer_response',
      title: 'Offer update',
      body: `Your offer on ${listingTitle} was not accepted.`,
      data: { listingId: offer.listing_id, offerId, link: `/market/listing/${offer.listing_id}` },
    });
    return NextResponse.json({ success: true, status: 'declined' });
  }

  const offerType = offer.offer_type as string;
  let redirectUrl: string | null = null;
  let buyerRedirectUrl: string | null = null;
  let acceptedOrderId: string | null = null;
  let acceptedTradeId: string | null = null;

  if (offerType === 'cash' || offerType === 'cash_and_trade') {
    const amountCents = offer.amount_cents as number | null;
    if (!amountCents || amountCents < 100) {
      return NextResponse.json({ error: 'Invalid cash offer amount' }, { status: 400 });
    }

    const shippingCents = listing.shipping_cents ?? 0;
    const { feeCents, payoutCents } = calcMarketFees(amountCents);
    const payoutRecipientId = await resolvePayoutRecipientId(admin, listing.seller_id);

    const { data: order, error: orderErr } = await admin
      .from('market_orders')
      .insert({
        tenant_slug: tenant.slug,
        listing_id: offer.listing_id,
        buyer_id: offer.buyer_id,
        seller_id: listing.seller_id,
        payout_recipient_id: payoutRecipientId,
        amount_cents: amountCents,
        shipping_cents: shippingCents,
        platform_fee_cents: feeCents,
        seller_payout_cents: payoutCents,
        status: 'pending_payment',
        seller_condition: listing.condition,
      })
      .select('id')
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: orderErr?.message || 'Could not create order' }, { status: 500 });
    }

    acceptedOrderId = order.id;
    buyerRedirectUrl = `/market/listing/${offer.listing_id}/checkout?order=${order.id}`;
    redirectUrl = buyerRedirectUrl;
  }

  if (offerType === 'trade' || offerType === 'cash_and_trade') {
    const tradeListingId = offer.trade_listing_id as string | null;
    if (!tradeListingId) {
      return NextResponse.json({ error: 'Trade listing missing' }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const bootCents = offerType === 'cash_and_trade' ? (offer.amount_cents as number) ?? 0 : 0;

    const { data: trade, error: tradeErr } = await admin
      .from('market_trades')
      .insert({
        tenant_slug: tenant.slug,
        initiator_id: offer.buyer_id,
        receiver_id: listing.seller_id,
        initiator_listing_id: tradeListingId,
        receiver_listing_id: offer.listing_id,
        boot_amount_cents: bootCents,
        status: 'receiver_accepted',
        expires_at: expiresAt,
        message: offer.message,
      })
      .select('id')
      .single();

    if (tradeErr || !trade) {
      return NextResponse.json({ error: tradeErr?.message || 'Could not create trade' }, { status: 500 });
    }

    const locked = await lockListingsForTrade(
      admin,
      [tradeListingId, offer.listing_id as string],
      offer.buyer_id as string
    );
    if (!locked) {
      await admin.from('market_trades').delete().eq('id', trade.id);
      return NextResponse.json(
        { error: 'One of these pairs is no longer available for trade.' },
        { status: 409 }
      );
    }

    await findOrCreateThread(admin, {
      threadType: 'trade',
      tenantSlug: tenant.slug,
      participantIds: [offer.buyer_id as string, listing.seller_id],
      listingId: offer.listing_id as string,
      tradeId: trade.id,
    });

    acceptedTradeId = trade.id;
    redirectUrl = `/market/trade/${trade.id}`;
    buyerRedirectUrl = redirectUrl;
  }

  await admin
    .from('market_offers')
    .update({
      status: 'accepted',
      accepted_order_id: acceptedOrderId,
      accepted_trade_id: acceptedTradeId,
    })
    .eq('id', offerId);

  await admin
    .from('market_offers')
    .update({ status: 'declined' })
    .eq('listing_id', offer.listing_id)
    .eq('status', 'pending')
    .neq('id', offerId);

  const { data: buyerRow } = await admin
    .from('users')
    .select('first_name, phone')
    .eq('id', offer.buyer_id)
    .maybeSingle();

  const buyerName = buyerRow?.first_name?.trim() || 'Buyer';

  await createNotification(admin, {
    user_id: offer.buyer_id as string,
    type: 'market_offer_response',
    title: 'Offer accepted',
    body: `Your offer on ${listingTitle} was accepted.`,
    data: {
      listingId: offer.listing_id,
      offerId,
      link: buyerRedirectUrl ?? `/market/listing/${offer.listing_id}`,
    },
  });

  const buyerPhone = normalizePhone(buyerRow?.phone as string | null | undefined);
  if (buyerPhone) {
    void sendSms(
      buyerPhone,
      `Your offer on ${listingTitle} was accepted. Open Guild Market to complete next steps.`,
      {
        admin,
        messageType: 'market_offer_accepted',
        recipientId: offer.buyer_id as string,
        recipientLabel: buyerName,
      }
    );
  }

  return NextResponse.json({
    success: true,
    status: 'accepted',
    redirectUrl,
    buyerRedirectUrl,
  });
}
