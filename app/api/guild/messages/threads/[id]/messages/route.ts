import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { sendGuildMessage, type GuildMessageDeliveryChannel } from '@/lib/guild-messaging';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: threadId } = await params;
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    body?: string;
    link?: string;
    deliveryChannel?: GuildMessageDeliveryChannel;
  };
  if (body.deliveryChannel && body.deliveryChannel !== 'in_app' && body.deliveryChannel !== 'sms') {
    return NextResponse.json({ error: 'Invalid delivery channel' }, { status: 400 });
  }
  const admin = createAdminClient(tenant.slug);

  try {
    const message = await sendGuildMessage(supabase, admin, {
      threadId,
      senderId: user.id,
      body: body.body ?? '',
      link: body.link,
      deliveryChannel: body.deliveryChannel ?? 'in_app',
    });
    return NextResponse.json({ message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to send';
    const status = msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
