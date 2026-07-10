import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findOrCreateThread,
  findThreadIdByContext,
  loadThreadMessages,
  type GuildMessageRow,
} from '@/lib/guild-messaging';

export async function ensureCoachInquiryThread(
  supabase: SupabaseClient,
  tenantSlug: string,
  parentId: string,
  coachUserId: string
): Promise<string> {
  return findOrCreateThread(supabase, {
    threadType: 'coach_inquiry',
    tenantSlug,
    participantIds: [parentId, coachUserId],
    inquiryParentId: parentId,
    inquiryCoachId: coachUserId,
    isPublic: false,
  });
}

export async function findCoachInquiryThreadId(
  supabase: SupabaseClient,
  parentId: string,
  coachUserId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('guild_threads')
    .select('id')
    .eq('thread_type', 'coach_inquiry')
    .eq('inquiry_parent_id', parentId)
    .eq('inquiry_coach_id', coachUserId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/** Copy legacy coach_inquiries rows into guild_messages once per thread. */
export async function migrateLegacyCoachInquiriesToGuild(
  admin: SupabaseClient,
  threadId: string,
  parentId: string,
  coachUserId: string
): Promise<void> {
  const { count } = await admin
    .from('guild_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId);
  if ((count ?? 0) > 0) return;

  const { data: legacy } = await admin
    .from('coach_inquiries')
    .select('sender_id, body, created_at')
    .eq('parent_id', parentId)
    .eq('athlete_id', coachUserId)
    .order('created_at', { ascending: true });

  if (!legacy?.length) return;

  for (const row of legacy) {
    await admin.from('guild_messages').insert({
      thread_id: threadId,
      sender_id: row.sender_id,
      body: row.body,
      read_by: [row.sender_id as string],
      created_at: row.created_at,
    });
  }
}

export async function loadCoachInquiryMessages(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  tenantSlug: string,
  parentId: string,
  coachUserId: string
): Promise<{ threadId: string; messages: GuildMessageRow[] }> {
  const threadId = await ensureCoachInquiryThread(supabase, tenantSlug, parentId, coachUserId);
  await migrateLegacyCoachInquiriesToGuild(admin, threadId, parentId, coachUserId);
  const messages = await loadThreadMessages(supabase, threadId, { nameClient: admin });
  return { threadId, messages };
}
