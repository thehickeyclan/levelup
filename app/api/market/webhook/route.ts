import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain, tenants } from '@/config/tenants';
import { createNotification } from '@/lib/notifications';
import {
  detectListingFollowEvents,
  notifyListingFollowers,
} from '@/lib/market/notify-listing-followers';
import { listingInventoryDepleted, restoreListingSize } from '@/lib/market/listing-sizes';
import { completeTradeListings } from '@/lib/market/trade-lifecycle';
import { findOrCreateThread } from '@/lib/guild-messaging';
import { normalizePhone, sendSms } from '@/lib/twilio';
import type { ShippingAddress } from '@/lib/market/shipping';

function stripeSessionShippingAddress(session: Stripe.Checkout.Session): ShippingAddress | null {
  const checkoutSession = session as Stripe.Checkout.Session & {
    shipping_details?: {
      name?: string | null;
      address?: {
        line1?: string | null;
        line2?: string | null;
        city?: string | null;
        state?: string | null;
        postal_code?: string | null;
      } | null;
    } | null;
  };
  const details = checkoutSession.shipping_details;
  const address = details?.address ?? session.customer_details?.address;
  if (!address) return null;
  const name = details?.name ?? session.customer_details?.name ?? undefined;
  const normalized: ShippingAddress = {
    name: name ?? undefined,
    line1: address.line1 ?? undefined,
    line2: address.line2 ?? undefined,
    city: address.city ?? undefined,
    state: address.state ?? undefined,
    zip: address.postal_code ?? undefined,
  };
  return normalized.line1 && normalized.city && normalized.state && normalized.zip
    ? normalized
    : null;
}

function getMarketWebhookSecret(tenantSlug: string): string {
  const key =
    process.env.MARKET_STRIPE_WEBHOOK_SECRET?.trim() ||
    process.env[`${tenantSlug.toUpperCase().replace(/-/g, '_')}_MARKET_STRIPE_WEBHOOK_SECRET`] ||
    process.env.GUILD_MARKET_STRIPE_WEBHOOK_SECRET;
  if (!key) throw new Error('Market webhook secret not configured');
  return key;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host) ?? { slug: 'guild' };

  let event: Stripe.Event;
  try {
    const stripe = getStripeInstance(tenant.slug);
    event = stripe.webhooks.constructEvent(body, signature, getMarketWebhookSecret(tenant.slug));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed';
    console.error('Market webhook signature error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.app !== 'guild-market') {
      return NextResponse.json({ received: true });
    }

    const rawSlug = (session.metadata?.tenant_slug as string | undefined)?.trim().toLowerCase();
    const tenantSlug = rawSlug && rawSlug in tenants ? rawSlug : tenant.slug;
    const supabase = createAdminClient(tenantSlug);

    if (session.metadata?.market_trade_fee === 'true') {
      const tradeId = session.metadata.trade_id;
      const payerSide = session.metadata.payer_side;
      if (!tradeId || !payerSide) return NextResponse.json({ received: true });

      const updates: Record<string, unknown> = {};
      if (payerSide === 'initiator') updates.initiator_fee_paid = true;
      if (payerSide === 'receiver') updates.receiver_fee_paid = true;
      updates.status = 'fees_pending';

      await supabase.from('market_trades').update(updates).eq('id', tradeId);

      const { data: trade } = await supabase
        .from('market_trades')
        .select('initiator_fee_paid, receiver_fee_paid, initiator_listing_id, receiver_listing_id, initiator_id, receiver_id')
        .eq('id', tradeId)
        .single();

      if (trade?.initiator_fee_paid && trade.receiver_fee_paid) {
        await supabase.from('market_trades').update({ status: 'completed' }).eq('id', tradeId);
        await completeTradeListings(supabase, [
          trade.initiator_listing_id as string,
          trade.receiver_listing_id as string,
        ]);
        const { data: tradedListings } = await supabase
          .from('market_listings')
          .select('id, seller_id, title, brand, model')
          .in('id', [trade.initiator_listing_id, trade.receiver_listing_id]);
        for (const row of tradedListings ?? []) {
          void notifyListingFollowers(tenantSlug, {
            id: row.id as string,
            seller_id: row.seller_id as string,
            title: row.title as string,
            brand: row.brand as string,
            model: row.model as string,
          }, { type: 'traded' });
        }
        await createNotification(supabase, {
          user_id: trade.initiator_id,
          type: 'market_trade_completed',
          title: 'Trade completed',
          body: 'Both fees paid — coordinate shipping with your trade partner.',
        });
        await createNotification(supabase, {
          user_id: trade.receiver_id,
          type: 'market_trade_completed',
          title: 'Trade completed',
          body: 'Both fees paid — coordinate shipping with your trade partner.',
        });
      }

      return NextResponse.json({ received: true });
    }

    if (session.metadata?.market_checkout !== 'true') {
      return NextResponse.json({ received: true });
    }

    const orderId = session.metadata.market_order_id;
    const listingId = session.metadata.listing_id;
    if (!orderId || !listingId) {
      console.error('Market webhook missing order/listing', session.metadata);
      return NextResponse.json({ error: 'Missing metadata' }, { status: 500 });
    }

    const { data: existing } = await supabase
      .from('market_orders')
      .select('status')
      .eq('id', orderId)
      .maybeSingle();

    if (existing?.status === 'paid' || existing?.status === 'completed') {
      return NextResponse.json({ received: true });
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    const orderUpdates: Record<string, unknown> = {
      status: 'paid',
      stripe_payment_intent_id: paymentIntentId ?? null,
    };
    const collectedShippingAddress = stripeSessionShippingAddress(session);
    if (collectedShippingAddress) {
      orderUpdates.shipping_address = collectedShippingAddress;
    }

    await supabase.from('market_orders').update(orderUpdates).eq('id', orderId);

    const depleted = await listingInventoryDepleted(supabase, listingId);
    if (depleted) {
      await supabase
        .from('market_listings')
        .update({
          status: 'sold',
          locked_buyer_id: null,
          locked_at: null,
        })
        .eq('id', listingId);
    } else {
      await supabase
        .from('market_listings')
        .update({
          locked_buyer_id: null,
          locked_at: null,
        })
        .eq('id', listingId);
    }

    const sellerId = session.metadata.seller_id;
    const { data: listingRow } = await supabase
      .from('market_listings')
      .select('title, brand, model, seller_id')
      .eq('id', listingId)
      .maybeSingle();
    const listingTitle = (listingRow?.title as string) || 'listing';

    if (listingRow) {
      void notifyListingFollowers(tenantSlug, {
        id: listingId,
        seller_id: listingRow.seller_id as string,
        title: listingRow.title as string,
        brand: listingRow.brand as string,
        model: listingRow.model as string,
      }, { type: 'sold' });
    }

    const { data: orderRow } = await supabase
      .from('market_orders')
      .select('order_ref')
      .eq('id', orderId)
      .maybeSingle();

    if (sellerId) {
      await createNotification(supabase, {
        user_id: sellerId,
        type: 'market_listing_sold',
        title: 'Your pair sold!',
        body: `Your ${listingTitle} sold! Ship to buyer within 3 days.`,
        data: { order_id: orderId, listing_id: listingId },
      });
      const { data: sellerUser } = await supabase
        .from('users')
        .select('phone')
        .eq('id', sellerId)
        .maybeSingle();
      const sellerPhone = normalizePhone(sellerUser?.phone as string | null | undefined);
      if (sellerPhone) {
        void sendSms(sellerPhone, `Your ${listingTitle} sold on Guild Market. Ship to the buyer within 3 days.`, {
          admin: supabase,
          messageType: 'market_listing_sold',
          recipientId: sellerId,
        });
      }
    }

    const buyerId = session.metadata.buyer_id;
    if (buyerId) {
      await createNotification(supabase, {
        user_id: buyerId,
        type: 'market_order_placed',
        title: 'Order placed',
        body: `Order placed — #${orderRow?.order_ref ?? 'MKT'}`,
        data: { order_id: orderId, link: `/market/orders/${orderId}` },
      });
    }

    if (buyerId && sellerId) {
      await findOrCreateThread(supabase, {
        threadType: 'order',
        tenantSlug: tenantSlug,
        participantIds: [buyerId, sellerId],
        listingId,
        orderId,
      });
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent;
    const orderId = pi.metadata?.market_order_id;
    const listingId = pi.metadata?.listing_id;
    if (orderId && listingId && pi.metadata?.market_checkout === 'true') {
      const rawSlug = (pi.metadata?.tenant_slug as string | undefined)?.trim().toLowerCase();
      const tenantSlug = rawSlug && rawSlug in tenants ? rawSlug : tenant.slug;
      const supabase = createAdminClient(tenantSlug);
      const { data: orderRow } = await supabase
        .from('market_orders')
        .select('size_us')
        .eq('id', orderId)
        .maybeSingle();
      await supabase.from('market_orders').update({ status: 'cancelled' }).eq('id', orderId);
      if (orderRow?.size_us != null) {
        await restoreListingSize(supabase, listingId, Number(orderRow.size_us));
      }
      await supabase
        .from('market_listings')
        .update({ status: 'active', locked_buyer_id: null, locked_at: null })
        .eq('id', listingId);
    }
  }

  return NextResponse.json({ received: true });
}
