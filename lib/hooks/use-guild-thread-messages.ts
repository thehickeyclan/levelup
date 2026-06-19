'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/components/theme-provider';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GuildMessageRow } from '@/lib/guild-messaging';

export function useGuildThreadMessages(threadId: string, currentUserId: string) {
  const tenant = useTenant();
  const supabase = useMemo(() => createClient(tenant.slug), [tenant.slug]);
  const [messages, setMessages] = useState<GuildMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const markRead = useCallback(async () => {
    if (!threadId || !currentUserId) return;
    try {
      await fetch(`/api/guild/messages/threads/${threadId}/read`, { method: 'POST' });
    } catch {
      /* ignore */
    }
  }, [threadId, currentUserId]);

  const fetchMessages = useCallback(async () => {
    if (!threadId) return;
    setError(null);
    try {
      const res = await fetch(`/api/guild/messages/threads/${threadId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load messages');
      setMessages(data.messages ?? []);
      void markRead();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load messages');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [threadId, markRead]);

  useEffect(() => {
    if (!threadId) return;
    setLoading(true);
    void fetchMessages();
  }, [threadId, fetchMessages]);

  useEffect(() => {
    if (!threadId) return;

    let channel: RealtimeChannel;

    channel = supabase
      .channel(`guild_thread_${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guild_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          const row = payload.new as GuildMessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                ...row,
                sender_name: row.sender_id === currentUserId ? 'You' : 'Member',
              },
            ];
          });
          void fetch(`/api/guild/messages/threads/${threadId}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.messages) setMessages(d.messages);
            })
            .catch(() => {});
          void markRead();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, supabase, currentUserId, markRead]);

  return { messages, loading, error, refresh: fetchMessages, markRead };
}
