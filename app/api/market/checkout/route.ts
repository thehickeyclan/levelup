import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { calcMarketFees } from '@/lib/market/fees';
import {
  fetchListingSizes,
  parseListingSizeUs,
  reserveListingSize,
  restoreListingSize,
} from '@/lib/market/listing-sizes';
import { resolvePayoutRecipientId } from '@/lib/market/seller';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import { publicOriginForStripeRedirect } from '@/lib/stripe-redirect-origin';
import type { ShippingAddress } from '@/lib/market/shipping';

function hasCompleteShippingAddress(address: ShippingAddress | null | undefined) {
  return Boolean(
    address?.name?.trim() &&
      address?.line1?.trim() &&
      address?.city?.trim() &&
      address?.state?.trim() &&
      address?.zip?.trim()
  );
}

async function createCheckoutSession(
  admin: ReturnType<typeof createAdminClient>,
  tenantSlug: string,
  host: string,
  req: NextRequest,
  order: { id: string; order_ref: string; amount_cents: number; shipping_cents: number; listing_id: string; buyer_id: string; seller_id: string; platform_fee_cents: number; seller_payout_cents: number },
  listingTitle: string,
  options: { collectShippingAddress?: boolean } = {}
) {
  const stripeEnabled = process.env.STRIPE_CHECKOUT_ENABLED === 'true';
  if (!stripeEnabled) {
    return { error: NextResponse.json({ error: 'Online payment is not enabled' }, { status: 503 }) };
  }

  const origin = publicOriginForStripeRedirect(host, req);
  const stripe = getStripeInstance(tenantSlug);
  const priceCents = order.amount_cents;
  const shippingCents = order.shipping_cents ?? 0;

  const lineItems: { price_data: { currency: string; product_data: { name: string }; unit_amount: number }; quantity: number }[] = [
    {
      price_data: {
        currency: 'usd',
        product_data: { name: listingTitle || 'Guild Market item' },
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
    ...(options.collectShippingAddress
      ? {
          shipping_address_collection: {
            allowed_countries: ['US'],
          },
        }
      : {}),
    payment_intent_data: {
      metadata: {
        app: 'guild-market',
        market_checkout: 'true',
        tenant_slug: tenantSlug,
        market_order_id: order.id,
        listing_id: order.listing_id,
        buyer_id: order.buyer_id,
        seller_id: order.seller_id,
      },
    },
    success_url: `${origin}/market/orders?success=true&order=${order.order_ref}`,
    cancel_url: `${origin}/market/listing/${order.listing_id}/checkout?order=${order.id}`,
    metadata: {
      app: 'guild-market',
      market_checkout: 'true',
      tenant_slug: tenantSlug,
      market_order_id: order.id,
      listing_id: order.listing_id,
      buyer_id: order.buyer_id,
      seller_id: order.seller_id,
      fee_cents: String(order.platform_fee_cents),
      payout_cents: String(order.seller_payout_cents),
    },
  });

  await admin
    .from('market_orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', order.id);

  return { checkoutUrl: session.url };
}

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    listingId?: string;
    orderId?: string;
    sizeUs?: number | string;
    shippingAddress?: ShippingAddress;
    shipping_address?: ShippingAddress;
  };

  const listingId = body.listingId?.trim();
  const orderId = body.orderId?.trim();
  const shippingAddress = body.shippingAddress ?? body.shipping_address ?? null;

  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const headersList = await headers();
  const host = headersList.get('host') || '';

  if (orderId) {
    const { data: order } = await admin
      .from('market_orders')
      .select('id, order_ref, amount_cents, shipping_cents, listing_id, buyer_id, seller_id, platform_fee_cents, seller_payout_cents, status, shipping_address')
      .eq('id', orderId)
      .eq('listing_id', listingId)
      .eq('buyer_id', user!.id)
      .eq('status', 'pending_payment')
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ error: 'Order not found or not payable' }, { status: 404 });
    }

    if (shippingAddress) {
      await admin.from('market_orders').update({ shipping_address: shippingAddress }).eq('id', orderId);
    }

    const { data: listing } = await admin
      .from('market_listings')
      .select('title')
      .eq('id', listingId)
      .single();

    const result = await createCheckoutSession(
      admin,
      tenant.slug,
      host,
      req,
      order as Parameters<typeof createCheckoutSession>[4],
      (listing?.title as string) || 'Guild Market item',
      {
        collectShippingAddress: !hasCompleteShippingAddress(
          shippingAddress ?? (order.shipping_address as ShippingAddress | null)
        ),
      }
    );
    if ('error' in result && result.error) return result.error;
    return NextResponse.json({ checkoutUrl: result.checkoutUrl, orderRef: order.order_ref });
  }

  const now = new Date().toISOString();

  const { data: listingRow, error: listingLoadErr } = await admin
    .from('market_listings')
    .select('id, price_cents, shipping_cents, seller_id, title, condition, wear_state, status, locked_buyer_id')
    .eq('id', listingId)
    .eq('status', 'active')
    .maybeSingle();

  if (listingLoadErr || !listingRow) {
    return NextResponse.json({ error: 'This listing is no longer available.' }, { status: 409 });
  }

  const inventorySizes = await fetchListingSizes(admin, listingId);
  const usesSizeInventory = inventorySizes.length > 0;

  let resolvedSizeUs = parseListingSizeUs(body.sizeUs);
  if (usesSizeInventory) {
    if (!resolvedSizeUs) {
      return NextResponse.json({ error: 'Select a size before checkout.' }, { status: 400 });
    }
    const reserve = await reserveListingSize(admin, listingId, resolvedSizeUs);
    if (!reserve.ok) {
      return NextResponse.json({ error: reserve.error }, { status: 409 });
    }
  }

  if (!usesSizeInventory) {
    if (listingRow.locked_buyer_id && listingRow.locked_buyer_id !== user!.id) {
      return NextResponse.json({ error: 'This listing is no longer available.' }, { status: 409 });
    }
  }

  const { data: listing, error: lockErr } = usesSizeInventory
    ? { data: listingRow, error: null }
    : await admin
        .from('market_listings')
        .update({ locked_buyer_id: user!.id, locked_at: now })
        .eq('id', listingId)
        .eq('status', 'active')
        .is('locked_buyer_id', null)
        .select('id, price_cents, shipping_cents, seller_id, title, condition')
        .single();

  if (lockErr || !listing) {
    if (resolvedSizeUs != null && usesSizeInventory) {
      await restoreListingSize(admin, listingId, resolvedSizeUs);
    }
    return NextResponse.json({ error: 'This listing is no longer available.' }, { status: 409 });
  }

  if (listing.seller_id === user!.id) {
    if (!usesSizeInventory) {
      await admin.from('market_listings').update({ locked_buyer_id: null, locked_at: null }).eq('id', listingId);
    }
    if (resolvedSizeUs != null && usesSizeInventory) {
      await restoreListingSize(admin, listingId, resolvedSizeUs);
    }
    return NextResponse.json({ error: 'You cannot buy your own listing.' }, { status: 400 });
  }

  const priceCents = listing.price_cents ?? 0;
  if (priceCents <= 0) {
    if (!usesSizeInventory) {
      await admin.from('market_listings').update({ locked_buyer_id: null, locked_at: null }).eq('id', listingId);
    }
    if (resolvedSizeUs != null && usesSizeInventory) {
      await restoreListingSize(admin, listingId, resolvedSizeUs);
    }
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

  const orderInsert: Record<string, unknown> = {
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
    shipping_address: shippingAddress,
    seller_condition: listing.condition,
    ai_condition_grade: aiRow?.condition_grade_suggested ?? null,
    ai_condition_score: aiRow?.condition_score ?? null,
  };
  if (resolvedSizeUs != null) {
    orderInsert.size_us = resolvedSizeUs;
  }

  const { data: order, error: orderErr } = await admin
    .from('market_orders')
    .insert(orderInsert)
    .select('id, order_ref, amount_cents, shipping_cents, listing_id, buyer_id, seller_id, platform_fee_cents, seller_payout_cents')
    .single();

  if (orderErr || !order) {
    if (!usesSizeInventory) {
      await admin.from('market_listings').update({ locked_buyer_id: null, locked_at: null }).eq('id', listingId);
    }
    if (resolvedSizeUs != null && usesSizeInventory) {
      await restoreListingSize(admin, listingId, resolvedSizeUs);
    }
    return NextResponse.json({ error: orderErr?.message || 'Order failed' }, { status: 500 });
  }

  const result = await createCheckoutSession(
    admin,
    tenant.slug,
    host,
    req,
    order as Parameters<typeof createCheckoutSession>[4],
    (listing.title as string) || 'Guild Market item',
    { collectShippingAddress: !hasCompleteShippingAddress(shippingAddress) }
  );
  if ('error' in result && result.error) return result.error;
  return NextResponse.json({ checkoutUrl: result.checkoutUrl, orderRef: order.order_ref });
}
