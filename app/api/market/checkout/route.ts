import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { calcMarketFees } from '@/lib/market/fees';
import { resolvePayoutRecipientId } from '@/lib/market/seller';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import { publicOriginForStripeRedirect } from '@/lib/stripe-redirect-origin';

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    listingId?: string;
    shipping_address?: {
      name?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
  };

  const listingId = body.listingId?.trim();
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const now = new Date().toISOString();
  const { data: listing, error: lockErr } = await admin
    .from('market_listings')
    .update({ locked_buyer_id: user!.id, locked_at: now })
    .eq('id', listingId)
    .eq('status', 'active')
    .is('locked_buyer_id', null)
    .select('id, price_cents, shipping_cents, seller_id, title, condition')
    .single();

  if (lockErr || !listing) {
    return NextResponse.json({ error: 'This listing is no longer available.' }, { status: 409 });
  }

  if (listing.seller_id === user!.id) {
    await admin.from('market_listings').update({ locked_buyer_id: null, locked_at: null }).eq('id', listingId);
    return NextResponse.json({ error: 'You cannot buy your own listing.' }, { status: 400 });
  }

  const priceCents = listing.price_cents ?? 0;
  if (priceCents <= 0) {
    await admin.from('market_listings').update({ locked_buyer_id: null, locked_at: null }).eq('id', listingId);
    return NextResponse.json({ error: 'Listing has no price.' }, { status: 400 });
  }

  const shippingCents = listing.shipping_cents ?? 0;
  const { feeCents, payoutCents } = calcMarketFees(priceCents);
  const payoutRecipientId = await resolvePayoutRecipientId(admin, listing.seller_id);

  const { data: aiRow } = await admin
    .from('market_ai_analysis')
    .select('condition_grade_suggested, condition_score')
    .eq('listing_id', listingId)
    .maybeSingle();

  const { data: order, error: orderErr } = await admin
    .from('market_orders')
    .insert({
      tenant_slug: tenant.slug,
      listing_id: listingId,
      buyer_id: user!.id,
      seller_id: listing.seller_id,
      payout_recipient_id: payoutRecipientId,
      amount_cents: priceCents,
      shipping_cents: shippingCents,
      platform_fee_cents: feeCents,
      seller_payout_cents: payoutCents,
      status: 'pending_payment',
      shipping_address: body.shipping_address ?? null,
      seller_condition: listing.condition,
      ai_condition_grade: aiRow?.condition_grade_suggested ?? null,
      ai_condition_score: aiRow?.condition_score ?? null,
    })
    .select('id, order_ref')
    .single();

  if (orderErr || !order) {
    await admin.from('market_listings').update({ locked_buyer_id: null, locked_at: null }).eq('id', listingId);
    return NextResponse.json({ error: orderErr?.message || 'Order failed' }, { status: 500 });
  }

  const stripeEnabled = process.env.STRIPE_CHECKOUT_ENABLED === 'true';
  if (!stripeEnabled) {
    return NextResponse.json({ error: 'Online payment is not enabled' }, { status: 503 });
  }

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const origin = publicOriginForStripeRedirect(host, req);
  const stripe = getStripeInstance(tenant.slug);

  const lineItems: { price_data: { currency: string; product_data: { name: string }; unit_amount: number }; quantity: number }[] = [
    {
      price_data: {
        currency: 'usd',
        product_data: { name: listing.title || 'Guild Market item' },
        unit_amount: priceCents,
      },
      quantity: 1,
    },
  ];

  if (shippingCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Shipping' },
        unit_amount: shippingCents,
      },
      quantity: 1,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: `${origin}/market/orders?success=true&order=${order.order_ref}`,
    cancel_url: `${origin}/market/checkout?listingId=${listingId}`,
    metadata: {
      app: 'guild-market',
      market_checkout: 'true',
      tenant_slug: tenant.slug,
      market_order_id: order.id,
      listing_id: listingId,
      buyer_id: user!.id,
      seller_id: listing.seller_id,
      fee_cents: String(feeCents),
      payout_cents: String(payoutCents),
    },
  });

  await admin
    .from('market_orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', order.id);

  return NextResponse.json({ checkoutUrl: session.url, orderRef: order.order_ref });
}
