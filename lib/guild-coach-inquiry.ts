import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadThreadMessages,
  type GuildMessageRow,
} from '@/lib/guild-messaging';

function isSchemaColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? '';
  return error.code === 'PGRST204' || msg.includes('inquiry_parent_id') || msg.includes('inquiry_coach_id');
}

/** Match coach_inquiry thread by both participant ids (works before inquiry_* migration). */
export async function findCoachInquiryByParticipants(
  supabase: SupabaseClient,
  parentId: string,
  coachUserId: string
): Promise<string | null> {
  const { data: rows, error } = await supabase
    .from('guild_threads')
    .select('id, participant_ids')
    .eq('thread_type', 'coach_inquiry')
    .contains('participant_ids', [parentId, coachUserId]);

  if (error) throw new Error(error.message);

  const match = (rows ?? []).find((r) => {
    const ids = new Set((r.participant_ids as string[]) ?? []);
    return ids.has(parentId) && ids.has(coachUserId);
  });
  return (match?.id as string) ?? null;
}

export async function findCoachInquiryThreadId(
  supabase: SupabaseClient,
  parentId: string,
  coachUserId: string
): Promise<string | null> {
  const byParticipants = await findCoachInquiryByParticipants(supabase, parentId, coachUserId);
  if (byParticipants) return byParticipants;

  const { data, error } = await supabase
    .from('guild_threads')
    .select('id')
    .eq('thread_type', 'coach_inquiry')
    .eq('inquiry_parent_id', parentId)
    .eq('inquiry_coach_id', coachUserId)
    .maybeSingle();

  if (error) {
    if (isSchemaColumnError(error)) return null;
    throw new Error(error.message);
  }
  return (data?.id as string) ?? null;
}

export async function ensureCoachInquiryThread(
  supabase: SupabaseClient,
  tenantSlug: string,
  parentId: string,
  coachUserId: string
): Promise<string> {
  const existing = await findCoachInquiryThreadId(supabase, parentId, coachUserId);
  if (existing) return existing;

  const participants = [parentId, coachUserId];
  const baseInsert = {
    thread_type: 'coach_inquiry' as const,
    tenant_slug: tenantSlug,
    participant_ids: participants,
    is_public: false,
    listing_id: null,
    offer_id: null,
    trade_id: null,
    order_id: null,
    session_id: null,
  };

  let { data: created, error } = await supabase
    .from('guild_threads')
    .insert({
      ...baseInsert,
      inquiry_parent_id: parentId,
      inquiry_coach_id: coachUserId,
    })
    .select('id')
    .single();

  if (isSchemaColumnError(error)) {
    ({ data: created, error } = await supabase
      .from('guild_threads')
      .insert(baseInsert)
      .select('id')
      .single());
  }

  if (error || !created) {
    throw new Error(error?.message || 'Could not create coach inquiry thread');
  }
  return created.id as string;
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
