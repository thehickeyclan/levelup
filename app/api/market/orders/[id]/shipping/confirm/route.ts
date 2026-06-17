import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { getMarketOrderForUser } from '@/lib/market/order-access';
import {
  cleanTrackingNumber,
  normalizeCarrier,
  trackingUrl,
  type MarketShippingCarrier,
} from '@/lib/market/shipping';
import { createNotification } from '@/lib/notifications';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id: orderId } = await params;
  const admin = createAdminClient(tenant.slug);

  const order = await getMarketOrderForUser(supabase, orderId, user!.id);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Only the seller can mark shipped' }, { status: 403 });
  }
  if (order.status !== 'paid') {
    return NextResponse.json({ error: 'Order is not ready to ship' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tracking_number?: string;
    carrier?: string;
  };

  const tracking = cleanTrackingNumber(body.tracking_number ?? '');
  if (tracking.length < 6) {
    return NextResponse.json({ error: 'Enter a valid tracking number' }, { status: 400 });
  }

  const carrier = normalizeCarrier(body.carrier) as MarketShippingCarrier;
  const now = new Date().toISOString();

  const { error } = await admin
    .from('market_orders')
    .update({
      tracking_number: tracking,
      shipping_carrier: carrier,
      status: 'shipped',
      shipped_at: now,
    })
    .eq('id', orderId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = trackingUrl(carrier, tracking);
  await createNotification(admin, {
    user_id: order.buyer_id as string,
    type: 'market_order_shipped',
    title: 'Your shoes shipped!',
    body: url
      ? `Tracking added — tap your order to follow delivery.`
      : `Seller marked your order shipped. Tracking: ${tracking}`,
    data: { order_id: orderId, tracking_number: tracking, tracking_url: url },
  });

  return NextResponse.json({
    ok: true,
    tracking_number: tracking,
    carrier,
    tracking_url: url,
    shipped_at: now,
  });
}
