import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { findOrCreateThread } from '@/lib/guild-messaging';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const tenant = getTenantFromRequestHeaders(await headers());
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: orderId } = await params;
  const { data: order } = await supabase
    .from('market_orders')
    .select('id, buyer_id, seller_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || (order.buyer_id !== user.id && order.seller_id !== user.id)) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { details?: string };
  const admin = createAdminClient(tenant.slug);
  const threadId = await findOrCreateThread(admin, {
    threadType: 'dispute',
    tenantSlug: tenant.slug,
    orderId,
    participantIds: [order.buyer_id as string, order.seller_id as string],
  });
  const { data: existingReport } = await admin
    .from('guild_message_reports')
    .select('id')
    .eq('reporter_id', user.id)
    .eq('thread_id', threadId)
    .eq('reason', 'marketplace_dispute')
    .in('status', ['open', 'reviewing'])
    .limit(1)
    .maybeSingle();
  if (!existingReport) {
    await admin.from('guild_message_reports').insert({
      reporter_id: user.id,
      thread_id: threadId,
      reason: 'marketplace_dispute',
      details: body.details?.trim().slice(0, 1000) || 'Marketplace dispute opened',
    });
  }
  return NextResponse.json({ threadId });
}
