import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from './api';
import { useAuth } from './auth';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export function useNotificationRealtime() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      setNotifications([]);
      setLoading(false);
      return;
    }
    try {
      const [countRes, listRes] = await Promise.all([
        apiFetch<{ count: number }>('/api/notifications?count=true&unread=true'),
        apiFetch<{ notifications: NotificationRow[] }>('/api/notifications'),
      ]);
      setUnreadCount(countRes.count ?? 0);
      setNotifications(listRes.notifications ?? []);
    } catch (e) {
      console.warn('notifications refresh', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [user, refresh]);

  const markAllRead = useCallback(async () => {
    await apiFetch('/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ all: true }),
    });
    await refresh();
  }, [refresh]);

  return { unreadCount, notifications, loading, refresh, markAllRead };
}
