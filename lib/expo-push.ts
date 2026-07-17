import type { SupabaseClient } from '@supabase/supabase-js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ExpoPushMessage = {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
};

function isExpoPushToken(token: string): boolean {
  return (
    /^ExponentPushToken\[.+]$/.test(token) ||
    /^ExpoPushToken\[.+]$/.test(token)
  );
}

/**
 * Send Expo push notifications to all registered devices for a user.
 * Failures are logged and never throw — in-app notification already succeeded.
 */
export async function sendExpoPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: { title: string; body?: string | null; data?: Record<string, unknown> | null }
): Promise<void> {
  const { data: rows, error } = await admin
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)
    .eq('enabled', true);

  if (error) {
    console.error('user_push_tokens select:', error.message);
    return;
  }

  const tokens = [
    ...new Set(
      (rows ?? [])
        .map((r) => String(r.expo_push_token ?? '').trim())
        .filter((t) => t && isExpoPushToken(t))
    ),
  ];
  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body?.trim() || undefined,
    data: payload.data ?? {},
    sound: 'default',
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Expo push HTTP error:', res.status, text.slice(0, 300));
      return;
    }
    const json = (await res.json().catch(() => null)) as {
      data?: Array<{ status?: string; details?: { error?: string }; message?: string }>;
    } | null;
    const tickets = json?.data ?? [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket?.status === 'error') {
        const errCode = ticket.details?.error ?? ticket.message;
        if (errCode === 'DeviceNotRegistered' || /not.?registered/i.test(String(errCode))) {
          const bad = tokens[i];
          if (bad) {
            await admin
              .from('user_push_tokens')
              .update({ enabled: false, updated_at: new Date().toISOString() })
              .eq('expo_push_token', bad);
          }
        } else {
          console.error('Expo push ticket error:', errCode);
        }
      }
    }
  } catch (e) {
    console.error('Expo push send failed:', e);
  }
}
