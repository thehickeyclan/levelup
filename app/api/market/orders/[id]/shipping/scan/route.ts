import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { callClaude, extractJsonFromClaude } from '@/lib/market/ai/client';
import {
  parseShippingLabelScan,
  SHIPPING_LABEL_SYSTEM_PROMPT,
} from '@/lib/market/ai/shipping-label';
import { getMarketOrderForUser } from '@/lib/market/order-access';
import { normalizeCarrier } from '@/lib/market/shipping';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

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
    return NextResponse.json({ error: 'Only the seller can scan a shipping label' }, { status: 403 });
  }
  if (order.status !== 'paid') {
    return NextResponse.json({ error: 'Tracking can be added after payment' }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Upload JPEG, PNG, or WebP' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `${tenant.slug}/${user!.id}/${orderId}/label-${Date.now()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from('market-shipping-labels')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error('shipping label upload:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  await admin
    .from('market_orders')
    .update({ shipping_label_storage_path: storagePath })
    .eq('id', orderId);

  const mediaType = file.type;
  const claude = await callClaude(SHIPPING_LABEL_SYSTEM_PROMPT, [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: buffer.toString('base64'),
      },
    },
    { type: 'text', text: 'Extract tracking number and carrier from this shipping label or receipt.' },
  ]);

  let scan = null;
  if (claude.ok) {
    try {
      scan = parseShippingLabelScan(JSON.parse(extractJsonFromClaude(claude.result.text)));
    } catch (e) {
      console.error('shipping label parse:', e);
    }
  }

  if (!scan) {
    return NextResponse.json({
      error: claude.ok
        ? 'Could not read tracking from this image — enter it manually.'
        : 'AI unavailable — enter tracking manually.',
      label_saved: true,
    }, { status: claude.ok ? 422 : 503 });
  }

  return NextResponse.json({
    scan: {
      tracking_number: scan.tracking_number,
      carrier: normalizeCarrier(scan.carrier),
      confidence: scan.confidence,
      note: scan.note ?? null,
    },
    label_saved: true,
  });
}
