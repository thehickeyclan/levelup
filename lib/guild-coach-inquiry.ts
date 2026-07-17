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
  const participantIds = new Set([parentId, coachUserId]);
  const { data: recipientUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', parentId)
    .maybeSingle();

  // Coach-to-youth conversations always include every linked guardian account.
  if (recipientUser?.role === 'youth_wrestler') {
    const [{ data: youth }, { data: guardianLinks }] = await Promise.all([
      supabase.from('youth_wrestlers').select('parent_id').eq('id', parentId).maybeSingle(),
      supabase
        .from('youth_wrestler_parents')
        .select('parent_id')
        .eq('youth_wrestler_id', parentId),
    ]);
    if (youth?.parent_id) participantIds.add(youth.parent_id as string);
    for (const link of guardianLinks ?? []) {
      if (link.parent_id) participantIds.add(link.parent_id as string);
    }
  }

  const existing = await findCoachInquiryThreadId(supabase, parentId, coachUserId);
  if (existing) {
    const { data: thread } = await supabase
      .from('guild_threads')
      .select('participant_ids')
      .eq('id', existing)
      .maybeSingle();
    const merged = [...new Set([
      ...((thread?.participant_ids as string[] | undefined) ?? []),
      ...participantIds,
    ])];
    if (merged.length !== ((thread?.participant_ids as string[] | undefined) ?? []).length) {
      await supabase.from('guild_threads').update({ participant_ids: merged }).eq('id', existing);
    }
    return existing;
  }

  const participants = [...participantIds];
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

/**
 * Make legacy DMs visible in the unified inbox before it is queried.
 * This is idempotent and allows the old coach_inquiries UI/API to stay retired
 * without hiding conversations that have not previously been opened.
 */
export async function migrateLegacyCoachInquiriesForUser(
  admin: SupabaseClient,
  tenantSlug: string,
  userId: string
): Promise<void> {
  const { data: legacy, error } = await admin
    .from('coach_inquiries')
    .select('parent_id, athlete_id')
    .or(`parent_id.eq.${userId},athlete_id.eq.${userId}`);

  // The legacy table may not exist on newer clean installations.
  if (error || !legacy?.length) return;

  const pairs = new Map<string, { parentId: string; coachId: string }>();
  for (const row of legacy) {
    const parentId = row.parent_id as string;
    const coachId = row.athlete_id as string;
    if (parentId && coachId) pairs.set(`${parentId}:${coachId}`, { parentId, coachId });
  }

  for (const { parentId, coachId } of pairs.values()) {
    const threadId = await ensureCoachInquiryThread(admin, tenantSlug, parentId, coachId);
    await migrateLegacyCoachInquiriesToGuild(admin, threadId, parentId, coachId);
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
