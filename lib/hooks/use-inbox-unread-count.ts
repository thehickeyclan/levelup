'use client';

import { useState, useEffect, useCallback } from 'react';

/** Unified Messages unread (guild_threads). */
export function useInboxUnreadCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    if (!enabled) return;
    fetch('/api/guild/messages/unread')
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((data) => setCount(data?.count ?? 0))
      .catch(() => setCount(0));
  }, [enabled]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, refresh]);
  return [count, refresh] as const;
}
