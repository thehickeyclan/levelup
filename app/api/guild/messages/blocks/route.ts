import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantFromRequestHeaders } from '@/config/tenants';

export async function POST(req: NextRequest) {
  const tenant = getTenantFromRequestHeaders(await headers());
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { blockedUserId?: string; threadId?: string };
  if (!body.blockedUserId || !body.threadId || body.blockedUserId === user.id) {
    return NextResponse.json({ error: 'Invalid block request' }, { status: 400 });
  }
  const { data: thread } = await supabase
    .from('guild_threads')
    .select('participant_ids')
    .eq('id', body.threadId)
    .maybeSingle();
  const participants = (thread?.participant_ids as string[] | undefined) ?? [];
  if (!participants.includes(user.id) || !participants.includes(body.blockedUserId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { error } = await supabase.from('guild_message_blocks').upsert({
    blocker_id: user.id,
    blocked_id: body.blockedUserId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const tenant = getTenantFromRequestHeaders(await headers());
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { blockedUserId?: string };
  if (!body.blockedUserId) return NextResponse.json({ error: 'Missing user' }, { status: 400 });
  await supabase
    .from('guild_message_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', body.blockedUserId);
  return NextResponse.json({ success: true });
}
