import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';
import { formatSellerDisplayName } from '@/lib/market/seller';
import { normalizePhone, sendSms } from '@/lib/twilio';
import { MESSAGES_HOME_PATH } from '@/lib/in-app-messaging';
import { parseNotificationPreferences } from '@/lib/notification-preferences';

export type GuildMessageDeliveryChannel = 'in_app' | 'sms';

export type GuildThreadType =
  | 'listing_qa'
  | 'offer'
  | 'trade'
  | 'order'
  | 'dispute'
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
  sender_photo_url?: string | null;
};

export const COACHING_THREAD_TYPES = new Set<GuildThreadType>([
  'session',
  'coach_inquiry',
  'session_change',
  'group_session',
]);

export const MARKET_THREAD_TYPES = new Set<GuildThreadType>([
  'listing_qa',
  'offer',
  'trade',
  'order',
  'dispute',
]);

async function isEitherUserBlocked(
  admin: SupabaseClient,
  firstUserId: string,
  secondUserId: string
): Promise<boolean> {
  const [{ data: first }, { data: second }] = await Promise.all([
    admin
      .from('guild_message_blocks')
      .select('blocker_id')
      .eq('blocker_id', firstUserId)
      .eq('blocked_id', secondUserId)
      .maybeSingle(),
    admin
      .from('guild_message_blocks')
      .select('blocker_id')
      .eq('blocker_id', secondUserId)
      .eq('blocked_id', firstUserId)
      .maybeSingle(),
  ]);
  return Boolean(first || second);
}

async function resolveSenderProfiles(
  nameLookup: SupabaseClient,
  senderIds: string[]
): Promise<Map<string, { name: string; photo_url: string | null }>> {
  const map = new Map<string, { name: string; photo_url: string | null }>();
  if (!senderIds.length) return map;

  const [{ data: users }, { data: athletes }] = await Promise.all([
    nameLookup.from('users').select('id, first_name, last_name').in('id', senderIds),
    nameLookup.from('athletes').select('id, first_name, last_name, photo_url').in('id', senderIds),
  ]);

  const athleteById = new Map((athletes ?? []).map((a) => [a.id as string, a]));

  for (const u of users ?? []) {
    const id = u.id as string;
    const athlete = athleteById.get(id);
    const name =
      athlete
        ? formatSellerDisplayName(athlete.first_name as string, athlete.last_name as string)
        : formatSellerDisplayName(u.first_name as string, u.last_name as string);
    map.set(id, {
      name: name || 'Member',
      photo_url: (athlete?.photo_url as string | null) ?? null,
    });
  }

  for (const a of athletes ?? []) {
    const id = a.id as string;
    if (map.has(id)) continue;
    map.set(id, {
      name:
        formatSellerDisplayName(a.first_name as string, a.last_name as string) || 'Coach',
      photo_url: (a.photo_url as string | null) ?? null,
    });
  }

  return map;
}

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
  inquiryParentId?: string;
  inquiryCoachId?: string;
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

  if (params.threadType === 'coach_inquiry') {
    if (!params.inquiryParentId || !params.inquiryCoachId) {
      throw new Error('Coach inquiry requires parent and coach ids');
    }
    const { ensureCoachInquiryThread } = await import('@/lib/guild-coach-inquiry');
    return ensureCoachInquiryThread(
      supabase,
      params.tenantSlug,
      params.inquiryParentId,
      params.inquiryCoachId
    );
  } else if (params.offerId) query = query.eq('offer_id', params.offerId);
  else if (params.tradeId) query = query.eq('trade_id', params.tradeId);
  else if (params.orderId) query = query.eq('order_id', params.orderId);
  else if (params.sessionId) query = query.eq('session_id', params.sessionId);
  else if (params.listingId) query = query.eq('listing_id', params.listingId);
  else throw new Error('Thread context id required');

  const { data: existingRows, error: existingError } = await query.limit(1);
  if (existingError) throw new Error(existingError.message);
  const existing = existingRows?.[0];
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
      inquiry_parent_id: params.inquiryParentId ?? null,
      inquiry_coach_id: params.inquiryCoachId ?? null,
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
  threadId: string
): Promise<void> {
  await supabase.rpc('mark_thread_read', {
    p_thread_id: threadId,
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
  threadId: string,
  options?: { nameClient?: SupabaseClient }
): Promise<GuildMessageRow[]> {
  const { data: rows } = await supabase
    .from('guild_messages')
    .select('id, thread_id, sender_id, body, read_by, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  const messages = rows ?? [];
  const senderIds = [...new Set(messages.map((m) => m.sender_id as string))];
  const profileMap = await resolveSenderProfiles(options?.nameClient ?? supabase, senderIds);

  return messages.map((m) => {
    const senderId = m.sender_id as string;
    const profile = profileMap.get(senderId);
    return {
      id: m.id as string,
      thread_id: m.thread_id as string,
      sender_id: senderId,
      body: m.body as string,
      read_by: (m.read_by as string[]) ?? [],
      created_at: m.created_at as string,
      sender_name: profile?.name ?? 'Member',
      sender_photo_url: profile?.photo_url ?? null,
    };
  });
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
    case 'dispute':
      return 'market_dispute_message';
    case 'session':
      return 'session_message';
    case 'coach_inquiry':
      return 'coach_inquiry_message';
    case 'group_session':
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
    deliveryChannel?: GuildMessageDeliveryChannel;
  }
): Promise<number> {
  const recipients = opts.participantIds.filter((id) => id !== opts.senderId);
  if (!recipients.length) return 0;

  const preview = opts.body.length > 80 ? `${opts.body.slice(0, 77)}...` : opts.body;
  const notifType = notificationTypeForThread(opts.threadType);

  let smsRecipients = 0;
  for (const userId of recipients) {
    if (await isEitherUserBlocked(admin, opts.senderId, userId)) continue;
    const { data: userRow } = await admin
      .from('users')
      .select('phone, first_name, notification_preferences')
      .eq('id', userId)
      .maybeSingle();
    const preferences = parseNotificationPreferences(userRow?.notification_preferences);

    await createNotification(admin, {
      user_id: userId,
      type: notifType,
      title: opts.listingTitle ? `New message · ${opts.listingTitle}` : 'New message',
      body: preview,
      data: {
        thread_id: opts.threadId,
        link: opts.link ?? `${MESSAGES_HOME_PATH}?thread=${opts.threadId}`,
        delivery_channel: opts.deliveryChannel ?? 'in_app',
      },
      skipPush: opts.deliveryChannel === 'sms' || !preferences.messaging_push,
    });

    if (opts.deliveryChannel === 'sms') {
      const phone = normalizePhone(userRow?.phone as string | null | undefined);
      if (phone && preferences.messaging_sms && !preferences.sms_opted_out) {
        const sent = await sendSms(phone, `New Guild message: ${preview}`, {
          admin,
          messageType: notifType,
          recipientId: userId,
          recipientLabel: userRow?.first_name as string | undefined,
        });
        if (sent) smsRecipients += 1;
      }
    }
  }
  return smsRecipients;
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
    deliveryChannel?: GuildMessageDeliveryChannel;
  }
): Promise<GuildMessageRow & { delivery_channel: GuildMessageDeliveryChannel; sms_recipients: number }> {
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

  if (thread.thread_type === 'coach_inquiry') {
    for (const participantId of participants) {
      if (participantId !== opts.senderId && await isEitherUserBlocked(admin, opts.senderId, participantId)) {
        throw new Error('Messaging is unavailable for this conversation');
      }
    }
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

  const deliveryChannel = opts.deliveryChannel ?? 'in_app';
  const smsRecipients = await notifyGuildMessageRecipients(admin, {
    threadId: opts.threadId,
    threadType: thread.thread_type as GuildThreadType,
    senderId: opts.senderId,
    body: trimmed,
    participantIds: mergedParticipants,
    link: opts.link,
    listingTitle: opts.listingTitle,
    deliveryChannel,
  });

  return {
    id: inserted.id as string,
    thread_id: inserted.thread_id as string,
    sender_id: inserted.sender_id as string,
    body: inserted.body as string,
    read_by: (inserted.read_by as string[]) ?? [],
    created_at: inserted.created_at as string,
    delivery_channel: deliveryChannel,
    sms_recipients: smsRecipients,
  };
}

/** Session thread — merges parents on small-group bookings into one roster thread. */
export async function ensureSessionGuildThread(
  supabase: SupabaseClient,
  tenantSlug: string,
  sessionId: string,
  parentUserId: string | null | undefined,
  coachUserId: string | null | undefined
): Promise<string | null> {
  if (!parentUserId || !coachUserId || parentUserId === coachUserId) return null;
  try {
    return await findOrCreateThread(supabase, {
      threadType: 'session',
      tenantSlug,
      sessionId,
      participantIds: [parentUserId, coachUserId],
      isPublic: false,
    });
  } catch (e) {
    console.warn('ensureSessionGuildThread failed', e);
    return null;
  }
}

export async function ensureSessionGuildThreadForParticipants(
  supabase: SupabaseClient,
  tenantSlug: string,
  sessionId: string,
  participantIds: string[]
): Promise<string | null> {
  const merged = uniqueParticipants(participantIds);
  if (merged.length < 2) return null;
  try {
    return await findOrCreateThread(supabase, {
      threadType: 'session',
      tenantSlug,
      sessionId,
      participantIds: merged,
      isPublic: false,
    });
  } catch (e) {
    console.warn('ensureSessionGuildThreadForParticipants failed', e);
    return null;
  }
}
