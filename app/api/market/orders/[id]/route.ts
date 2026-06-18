import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { getMarketOrderForUser, orderRole } from '@/lib/market/order-access';
import {
  formatShippingAddress,
  orderStatusLabel,
  trackingUrl,
  type MarketShippingCarrier,
  type ShippingAddress,
} from '@/lib/market/shipping';
import { createNotification } from '@/lib/notifications';
import { primaryListingImageUrl } from '@/lib/market/listing-images';

async function signedLabelUrl(admin: ReturnType<typeof createAdminClient>, storagePath: string | null) {
  if (!storagePath) return null;
  const { data } = await admin.storage
    .from('market-shipping-labels')
    .createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}

function serializeOrder(
  order: Record<string, unknown>,
  role: 'buyer' | 'seller',
  labelSignedUrl: string | null
) {
  const listing = order.market_listings as Record<string, unknown> | null;
  const images = (listing?.market_listing_images as Parameters<typeof primaryListingImageUrl>[0]) ?? [];
  const primary = primaryListingImageUrl(images);
  const carrier = (order.shipping_carrier as MarketShippingCarrier) || 'other';
  const tracking = (order.tracking_number as string) || null;
  const addr = order.shipping_address as ShippingAddress | null;

  return {
    id: order.id,
    order_ref: order.order_ref,
    status: order.status,
    status_label: orderStatusLabel(order.status as string),
    amount_cents: order.amount_cents,
    shipping_cents: order.shipping_cents,
    created_at: order.created_at,
    shipped_at: order.shipped_at,
    delivered_at: order.delivered_at,
    listing_id: order.listing_id,
    listing_title: listing?.title || [listing?.brand, listing?.model].filter(Boolean).join(' ') || 'Listing',
    listing_image: primary,
    role,
    shipping_carrier: carrier,
    tracking_number: tracking,
    tracking_url: tracking ? trackingUrl(carrier, tracking) : null,
    shipping_address: role === 'seller' ? addr : null,
    shipping_address_formatted: role === 'seller' ? formatShippingAddress(addr) : null,
    label_image_url: labelSignedUrl,
    can_add_tracking: role === 'seller' && order.status === 'paid',
    can_mark_received: role === 'buyer' && order.status === 'shipped',
    can_review: role === 'buyer' && order.status === 'completed',
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id } = await params;

  const order = await getMarketOrderForUser(supabase, id, user!.id);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const role = orderRole(order, user!.id)!;
  const admin = createAdminClient(tenant.slug);
  const labelSignedUrl = await signedLabelUrl(
    admin,
    order.shipping_label_storage_path as string | null
  );

  return NextResponse.json({ order: serializeOrder(order, role, labelSignedUrl) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id } = await params;
  const admin = createAdminClient(tenant.slug);

  const order = await getMarketOrderForUser(supabase, id, user!.id);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    status?: string;
    tracking_number?: string;
  };
  const role = orderRole(order, user!.id);

  if (body.tracking_number && role === 'seller') {
    if (order.status !== 'paid') {
      return NextResponse.json({ error: 'Order is not ready for tracking' }, { status: 400 });
    }
    const tracking = body.tracking_number.trim();
    if (!tracking) return NextResponse.json({ error: 'Tracking number required' }, { status: 400 });

    const now = new Date().toISOString();
    await admin
      .from('market_orders')
      .update({ status: 'shipped', tracking_number: tracking, shipped_at: now })
      .eq('id', id);

    await createNotification(admin, {
      user_id: order.buyer_id as string,
      type: 'market_order_shipped',
      title: 'Your order has shipped',
      body: `Tracking: ${tracking}`,
      data: { order_id: id, link: `/market/orders/${id}` },
    });

    const updated = { ...order, status: 'shipped', tracking_number: tracking, shipped_at: now };
    const labelSignedUrl = await signedLabelUrl(admin, order.shipping_label_storage_path as string | null);
    return NextResponse.json({ order: serializeOrder(updated, 'seller', labelSignedUrl) });
  }

  if (body.status === 'completed' && role === 'buyer') {
    if (order.status !== 'shipped') {
      return NextResponse.json({ error: 'Order is not shipped yet' }, { status: 400 });
    }
    const now = new Date().toISOString();
    await admin
      .from('market_orders')
      .update({ status: 'completed', delivered_at: now })
      .eq('id', id);

    await createNotification(admin, {
      user_id: order.seller_id as string,
      type: 'market_order_delivered',
      title: 'Buyer confirmed delivery',
      body: 'Order marked complete. Payout processes per Guild Market policy.',
      data: { order_id: id },
    });

    const labelSignedUrl = await signedLabelUrl(admin, order.shipping_label_storage_path as string | null);
    const updated = { ...order, status: 'completed', delivered_at: now };
    return NextResponse.json({ order: serializeOrder(updated, 'buyer', labelSignedUrl) });
  }

  if (body.action === 'received' && role === 'buyer') {
    if (order.status !== 'shipped') {
      return NextResponse.json({ error: 'Order is not shipped yet' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await admin
      .from('market_orders')
      .update({ status: 'completed', delivered_at: now })
      .eq('id', id);

    await createNotification(admin, {
      user_id: order.seller_id as string,
      type: 'market_order_delivered',
      title: 'Buyer received your shipment',
      body: 'They can leave seller feedback. Payout processes per Guild Market policy.',
      data: { order_id: id },
    });

    const labelSignedUrl = await signedLabelUrl(
      admin,
      order.shipping_label_storage_path as string | null
    );
    const updated = { ...order, status: 'completed', delivered_at: now };
    return NextResponse.json({
      order: serializeOrder(updated, 'buyer', labelSignedUrl),
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
