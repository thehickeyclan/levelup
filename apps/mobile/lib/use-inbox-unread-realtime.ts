import { useCallback, useEffect, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { apiFetch } from './api';
import { useAuth } from './auth';
import { supabase } from './supabase';

const INBOX_UNREAD_CHANGED = 'guild-inbox-unread-changed';

export function notifyInboxUnreadChanged() {
  DeviceEventEmitter.emit(INBOX_UNREAD_CHANGED);
}

/** Keeps the Inbox tab badge current after message inserts, read receipts, and app resume. */
export function useInboxUnreadRealtime() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0);
      return;
    }
    try {
      const result = await apiFetch<{ count?: number }>('/api/guild/messages/unread');
      setCount(Math.max(0, Number(result.count ?? 0)));
    } catch {
      // Keep the last known count during a temporary connection failure.
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`mobile-inbox-badge:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guild_messages' },
        () => void refresh()
      )
      .subscribe();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const localSubscription = DeviceEventEmitter.addListener(
      INBOX_UNREAD_CHANGED,
      () => void refresh()
    );
    const interval = setInterval(() => void refresh(), 15_000);

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
      localSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [refresh, user]);

  return { count, refresh };
}
