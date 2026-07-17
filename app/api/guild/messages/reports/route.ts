import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantFromRequestHeaders } from '@/config/tenants';

const REASONS = new Set(['spam', 'harassment', 'unsafe_contact', 'inappropriate_content', 'marketplace_dispute', 'other']);

export async function POST(req: NextRequest) {
  const tenant = getTenantFromRequestHeaders(await headers());
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    threadId?: string;
    messageId?: string;
    reason?: string;
    details?: string;
  };
  if (!body.threadId || !body.reason || !REASONS.has(body.reason)) {
    return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
  }
  if (body.messageId) {
    const { data: message } = await supabase
      .from('guild_messages')
      .select('id')
      .eq('id', body.messageId)
      .eq('thread_id', body.threadId)
      .maybeSingle();
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  const { error } = await supabase.from('guild_message_reports').insert({
    reporter_id: user.id,
    thread_id: body.threadId,
    message_id: body.messageId ?? null,
    reason: body.reason,
    details: body.details?.trim().slice(0, 1000) || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ success: true });
}
