import { describe, expect, it, vi } from 'vitest';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  isBrowserRealtimeAvailable,
  safeRealtimeSubscribe,
} from './realtime-safe';

describe('realtime-safe', () => {
  it('reports unavailable when WebSocket is missing', () => {
    const original = globalThis.WebSocket;
    // @ts-expect-error — simulate SSR / restricted WebView
    delete globalThis.WebSocket;
    expect(isBrowserRealtimeAvailable()).toBe(false);
    globalThis.WebSocket = original;
  });

  it('does not throw when WebSocket is missing', () => {
    const original = globalThis.WebSocket;
    // @ts-expect-error — simulate SSR / restricted WebView
    delete globalThis.WebSocket;

    const supabase = {
      channel: vi.fn(),
    } as unknown as SupabaseClient;

    expect(
      safeRealtimeSubscribe(supabase, 'test_channel', (ch) => ch)
    ).toBeNull();
    expect(supabase.channel).not.toHaveBeenCalled();

    globalThis.WebSocket = original;
  });

  it('subscribes when WebSocket is available', () => {
    const subscribe = vi.fn();
    const channel = { subscribe } as unknown as RealtimeChannel;
    const supabase = {
      channel: vi.fn(() => channel),
    } as unknown as SupabaseClient;

    const result = safeRealtimeSubscribe(supabase, 'guild_thread_abc', (ch) => ch);
    expect(result).toBe(channel);
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it('returns null when subscribe throws WebSocket errors', () => {
    const subscribe = vi.fn(() => {
      throw new Error('WebSocket not available');
    });
    const channel = { subscribe } as unknown as RealtimeChannel;
    const supabase = {
      channel: vi.fn(() => channel),
    } as unknown as SupabaseClient;

    expect(
      safeRealtimeSubscribe(supabase, 'guild_thread_abc', (ch) => ch)
    ).toBeNull();
  });
});
