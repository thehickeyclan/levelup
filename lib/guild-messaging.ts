import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';
import { formatSellerDisplayName } from '@/lib/market/seller';
import { normalizePhone, sendSms } from '@/lib/twilio';

export type GuildThreadType =
  | 'listing_qa'
  | 'offer'
  | 'trade'
  | 'order'
  | 'session'
  | 'coach_inquiry'
  | 'session_change'
  | 'group_session';

export type GuildMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  read_by: string[];
  created_at: string;
  sender_name?: string;
};

type FindOrCreateParams = {
  threadType: GuildThreadType;
  tenantSlug: string;
  participantIds: string[];
  isPublic?: boolean;
  listingId?: string;
  offerId?: string;
  tradeId?: string;
  orderId?: string;
  sessionId?: string;
};

function uniqueParticipants(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export async function findOrCreateThread(
  supabase: SupabaseClient,
  params: FindOrCreateParams
): Promise<string> {
  const participants = uniqueParticipants(params.participantIds);
  let query = supabase
    .from('guild_threads')
    .select('id, participant_ids')
    .eq('thread_type', params.threadType);

  if (params.offerId) query = query.eq('offer_id', params.offerId);
  else if (params.tradeId) query = query.eq('trade_id', params.tradeId);
  else if (params.orderId) query = query.eq('order_id', params.orderId);
  else if (params.sessionId) query = query.eq('session_id', params.sessionId);
  else if (params.listingId) query = query.eq('listing_id', params.listingId);
  else throw new Error('Thread context id required');

  const { data: existing } = await query.maybeSingle();
  if (existing?.id) {
    const merged = uniqueParticipants([
      ...((existing.participant_ids as string[]) ?? []),
      ...participants,
    ]);
    if (merged.length !== ((existing.participant_ids as string[]) ?? []).length) {
      await supabase
        .from('guild_threads')
        .update({ participant_ids: merged })
        .eq('id', existing.id);
    }
    return existing.id as string;
  }

  const { data: created, error } = await supabase
    .from('guild_threads')
    .insert({
      thread_type: params.threadType,
      tenant_slug: params.tenantSlug,
      participant_ids: participants,
      is_public: params.isPublic ?? false,
      listing_id: params.listingId ?? null,
      offer_id: params.offerId ?? null,
      trade_id: params.tradeId ?? null,
      order_id: params.orderId ?? null,
      session_id: params.sessionId ?? null,
    })
    .select('id')
    .single();

  if (error || !created) throw new Error(error?.message || 'Could not create thread');
  return created.id as string;
}

export async function findThreadIdByContext(
  supabase: SupabaseClient,
  threadType: GuildThreadType,
  context: {
    listingId?: string;
    offerId?: string;
    tradeId?: string;
    orderId?: string;
    sessionId?: string;
  }
): Promise<string | null> {
  let query = supabase.from('guild_threads').select('id').eq('thread_type', threadType);
  if (context.offerId) query = query.eq('offer_id', context.offerId);
  else if (context.tradeId) query = query.eq('trade_id', context.tradeId);
  else if (context.orderId) query = query.eq('order_id', context.orderId);
  else if (context.sessionId) query = query.eq('session_id', context.sessionId);
  else if (context.listingId) query = query.eq('listing_id', context.listingId);
  else return null;

  const { data } = await query.maybeSingle();
  return (data?.id as string) ?? null;
}

export async function markThreadRead(
  supabase: SupabaseClient,
  threadId: string,
  userId: string
): Promise<void> {
  await supabase.rpc('mark_thread_read', {
    p_thread_id: threadId,
    p_user_id: userId,
  });
}

export async function getUnreadCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: threads } = await supabase
    .from('guild_threads')
    .select('id')
    .contains('participant_ids', [userId]);

  const threadIds = (threads ?? []).map((t) => t.id as string);
  if (!threadIds.length) return 0;

  const { count, error } = await supabase
    .from('guild_messages')
    .select('id', { count: 'exact', head: true })
    .in('thread_id', threadIds)
    .neq('sender_id', userId)
    .filter('read_by', 'not.cs', `{${userId}}`);

  if (error) return 0;
  return count ?? 0;
}

export async function getThreadUnreadCount(
  supabase: SupabaseClient,
  threadId: string,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('guild_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', threadId)
    .neq('sender_id', userId)
    .filter('read_by', 'not.cs', `{${userId}}`);

  if (error) return 0;
  return count ?? 0;
}

export async function loadThreadMessages(
  supabase: SupabaseClient,
  threadId: string
): Promise<GuildMessageRow[]> {
  const { data: rows } = await supabase
    .from('guild_messages')
    .select('id, thread_id, sender_id, body, read_by, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  const messages = rows ?? [];
  const senderIds = [...new Set(messages.map((m) => m.sender_id as string))];
  const nameMap = new Map<string, string>();

  if (senderIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('id', senderIds);
    for (const u of users ?? []) {
      nameMap.set(
        u.id as string,
        formatSellerDisplayName(u.first_name as string, u.last_name as string) || 'Member'
      );
    }
  }

  return messages.map((m) => ({
    id: m.id as string,
    thread_id: m.thread_id as string,
    sender_id: m.sender_id as string,
    body: m.body as string,
    read_by: (m.read_by as string[]) ?? [],
    created_at: m.created_at as string,
    sender_name: nameMap.get(m.sender_id as string) ?? 'Member',
  }));
}

function notificationTypeForThread(threadType: GuildThreadType): string {
  switch (threadType) {
    case 'listing_qa':
      return 'market_listing_question';
    case 'offer':
      return 'market_offer_reply';
    case 'trade':
      return 'market_trade_message';
    case 'order':
      return 'market_order_message';
    case 'session':
      return 'session_message';
    default:
      return 'guild_new_message';
  }
}

export async function notifyGuildMessageRecipients(
  admin: SupabaseClient,
  opts: {
    threadId: string;
    threadType: GuildThreadType;
    senderId: string;
    body: string;
    participantIds: string[];
    link?: string;
    listingTitle?: string;
    smsFirstMessageOnly?: boolean;
  }
): Promise<void> {
  const recipients = opts.participantIds.filter((id) => id !== opts.senderId);
  if (!recipients.length) return;

  let isFirstMessage = false;
  if (opts.smsFirstMessageOnly) {
    const { count } = await admin
      .from('guild_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', opts.threadId);
    isFirstMessage = (count ?? 0) <= 1;
  }

  const preview = opts.body.length > 80 ? `${opts.body.slice(0, 77)}...` : opts.body;
  const notifType = notificationTypeForThread(opts.threadType);

  for (const userId of recipients) {
    await createNotification(admin, {
      user_id: userId,
      type: notifType,
      title: opts.listingTitle ? `New message · ${opts.listingTitle}` : 'New message',
      body: preview,
      data: { thread_id: opts.threadId, link: opts.link ?? `/guild-messages?thread=${opts.threadId}` },
    });

    if (opts.smsFirstMessageOnly && isFirstMessage) {
      const { data: userRow } = await admin
        .from('users')
        .select('phone, first_name')
        .eq('id', userId)
        .maybeSingle();
      const phone = normalizePhone(userRow?.phone as string | null | undefined);
      if (phone) {
        void sendSms(phone, `New Guild message: ${preview}`, {
          admin,
          messageType: notifType,
          recipientId: userId,
          recipientLabel: userRow?.first_name as string | undefined,
        });
      }
    }
  }
}

export async function sendGuildMessage(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  opts: {
    threadId: string;
    senderId: string;
    body: string;
    link?: string;
    listingTitle?: string;
  }
): Promise<GuildMessageRow> {
  const trimmed = opts.body.trim();
  if (!trimmed || trimmed.length > 1000) {
    throw new Error('Message must be 1–1000 characters');
  }

  const { data: thread } = await supabase
    .from('guild_threads')
    .select('id, thread_type, participant_ids, is_public')
    .eq('id', opts.threadId)
    .maybeSingle();

  if (!thread) throw new Error('Thread not found');

  const participants = (thread.participant_ids as string[]) ?? [];
  const isPublic = Boolean(thread.is_public);
  if (!isPublic && !participants.includes(opts.senderId)) {
    throw new Error('Forbidden');
  }

  const { data: inserted, error } = await supabase
    .from('guild_messages')
    .insert({
      thread_id: opts.threadId,
      sender_id: opts.senderId,
      body: trimmed,
    })
    .select('id, thread_id, sender_id, body, read_by, created_at')
    .single();

  if (error || !inserted) throw new Error(error?.message || 'Could not send message');

  const mergedParticipants = uniqueParticipants([...participants, opts.senderId]);
  if (mergedParticipants.length !== participants.length) {
    await admin
      .from('guild_threads')
      .update({ participant_ids: mergedParticipants })
      .eq('id', opts.threadId);
  }

  await notifyGuildMessageRecipients(admin, {
    threadId: opts.threadId,
    threadType: thread.thread_type as GuildThreadType,
    senderId: opts.senderId,
    body: trimmed,
    participantIds: mergedParticipants,
    link: opts.link,
    listingTitle: opts.listingTitle,
    smsFirstMessageOnly: true,
  });

  return {
    id: inserted.id as string,
    thread_id: inserted.thread_id as string,
    sender_id: inserted.sender_id as string,
    body: inserted.body as string,
    read_by: (inserted.read_by as string[]) ?? [],
    created_at: inserted.created_at as string,
  };
}

/** Phase 2 UI deferred — thread exists at booking time for future session messaging. */
export async function ensureSessionGuildThread(
  supabase: SupabaseClient,
  tenantSlug: string,
  sessionId: string,
  parentUserId: string | null | undefined,
  coachUserId: string | null | undefined
): Promise<void> {
  if (!parentUserId || !coachUserId || parentUserId === coachUserId) return;
  try {
    await findOrCreateThread(supabase, {
      threadType: 'session',
      tenantSlug,
      sessionId,
      participantIds: [parentUserId, coachUserId],
      isPublic: false,
    });
  } catch (e) {
    console.warn('ensureSessionGuildThread failed', e);
  }
}
