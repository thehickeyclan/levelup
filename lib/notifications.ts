import type { SupabaseClient } from '@supabase/supabase-js';
import { logMessage } from './message-log';
import { sendExpoPushToUser } from './expo-push';

type InsertNotification = {
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
  /** Optional: for logging purposes */
  sessionId?: string | null;
  coachId?: string | null;
  /** Skip device push (rare). Default false. */
  skipPush?: boolean;
};

/**
 * Insert a notification for a user. Use admin client so we can notify any user (e.g. coach when parent books).
 * Also logs to message_log and sends Expo push when the user has registered device tokens.
 */
export async function createNotification(
  admin: SupabaseClient,
  payload: InsertNotification
): Promise<void> {
  await admin.from('notifications').insert({
    user_id: payload.user_id,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    data: payload.data ?? {},
  });

  void logMessage(admin, {
    channel: 'notification',
    recipientId: payload.user_id,
    messageType: payload.type,
    title: payload.title,
    body: payload.body,
    sessionId: payload.sessionId ?? (payload.data?.session_id as string) ?? null,
    coachId: payload.coachId ?? (payload.data?.coach_id as string) ?? null,
    status: 'sent',
    metadata: payload.data ?? {},
  });

  if (!payload.skipPush) {
    void sendExpoPushToUser(admin, payload.user_id, {
      title: payload.title,
      body: payload.body,
      data: {
        type: payload.type,
        ...(payload.data ?? {}),
      },
    });
  }
}
