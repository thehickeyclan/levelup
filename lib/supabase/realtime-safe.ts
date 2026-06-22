import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/** Browser-only guard — Node SSR and some embedded WebViews lack WebSocket. */
export function isBrowserRealtimeAvailable(): boolean {
  return typeof globalThis.WebSocket !== 'undefined';
}

/**
 * Subscribe to a Supabase Realtime channel without crashing when WebSocket is unavailable.
 * Returns the channel when subscribed, or null when live updates are skipped.
 */
export function safeRealtimeSubscribe(
  supabase: SupabaseClient,
  channelName: string,
  setup: (channel: RealtimeChannel) => RealtimeChannel
): RealtimeChannel | null {
  if (!isBrowserRealtimeAvailable()) return null;
  try {
    const channel = setup(supabase.channel(channelName));
    channel.subscribe();
    return channel;
  } catch (err) {
    console.warn('[realtime] Live updates unavailable:', err);
    return null;
  }
}
