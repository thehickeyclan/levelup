import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { getThreadUnreadCount } from '@/lib/guild-messaging';

async function canAccessThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
  userId: string
): Promise<boolean> {
  const { data: thread } = await supabase
    .from('guild_threads')
    .select('id, is_public, participant_ids')
    .eq('id', threadId)
    .maybeSingle();

  if (!thread) return false;
  if (thread.is_public) return true;
  return ((thread.participant_ids as string[]) ?? []).includes(userId);
}

export async function GET(
  _req: NextRequest,
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

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const isAdmin = userData?.role === 'admin';

  if (!isAdmin) {
    const allowed = await canAccessThread(supabase, threadId, user.id);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { loadThreadMessages } = await import('@/lib/guild-messaging');
  const admin = createAdminClient(tenant.slug);
  const messages = await loadThreadMessages(supabase, threadId, { nameClient: admin });
  const unread = await getThreadUnreadCount(supabase, threadId, user.id);

  return NextResponse.json({ messages, unread });
}
