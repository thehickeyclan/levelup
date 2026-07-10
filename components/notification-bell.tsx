'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { cn } from '@/lib/utils';

type Notification = {
  id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell({
  count,
  onRefresh,
}: {
  count: number;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/notifications')
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((data) => {
        setList(data?.notifications ?? []);
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const markAllRead = async () => {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      setList((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
      onRefresh();
    }
  };

  const markOneRead = async (id: string) => {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      onRefresh();
    }
  };

  const link = (n: Notification) => (typeof n.data?.link === 'string' ? n.data.link : null);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center min-h-[44px] min-w-[44px] p-1.5 text-white hover:text-accent transition-colors font-medium rounded hover:bg-white/10"
        aria-label={count > 0 ? `Notifications (${count} unread)` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-accent text-black rounded-full -translate-y-0.5 translate-x-0.5">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-black/50 md:hidden"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              'z-[61] flex flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg',
              'fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+3.75rem)] max-h-[min(70dvh,28rem)]',
              'md:absolute md:inset-x-auto md:left-auto md:right-0 md:top-full md:mt-1 md:w-[min(320px,calc(100vw-2rem))] md:max-h-[400px]'
            )}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0 min-w-0">
              <span className="font-semibold text-sm truncate">Notifications</span>
              {list.some((n) => !n.read_at) && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-muted-foreground hover:text-foreground shrink-0 whitespace-nowrap"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="overflow-y-auto overflow-x-hidden min-h-0 flex-1">
              {loading ? (
                <p className="p-4 text-sm text-muted-foreground">Loading…</p>
              ) : list.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
              ) : (
                <ul className="divide-y min-w-0">
                  {list.slice(0, 15).map((n) => {
                    const href = link(n);
                    const rowClass = cn(
                      'block px-3 py-2.5 min-w-0',
                      !n.read_at ? 'bg-muted/30' : '',
                      href ? 'hover:bg-muted/50' : ''
                    );
                    const content = (
                      <>
                        <p className="font-medium text-sm break-words">{n.title}</p>
                        {n.body ? (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3 break-words">
                            {n.body}
                          </p>
                        ) : null}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatEST(new Date(n.created_at), 'MMM d, h:mm a')}
                        </p>
                      </>
                    );
                    return (
                      <li key={n.id} className="min-w-0">
                        {href ? (
                          <Link
                            href={href}
                            onClick={() => {
                              markOneRead(n.id);
                              setOpen(false);
                            }}
                            className={rowClass}
                          >
                            {content}
                          </Link>
                        ) : (
                          <div className={rowClass}>{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t px-3 py-2 shrink-0 flex flex-col gap-1">
              <Link
                href="/messages"
                onClick={() => setOpen(false)}
                className="text-sm text-accent hover:underline font-medium"
              >
                Guild messages
              </Link>
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                View all notifications
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
