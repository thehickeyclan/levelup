'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { MessageThread } from '@/components/guild/message-thread';
import { cn } from '@/lib/utils';

type InboxRow = {
  id: string;
  thread_type: string;
  label: string;
  preview: string;
  last_at: string;
  unread: number;
  href: string;
};

export function GuildMessagesClient({
  currentUserId,
  initialThreadId,
}: {
  currentUserId: string;
  initialThreadId: string | null;
}) {
  const [threads, setThreads] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);

  useEffect(() => {
    fetch('/api/guild/messages/inbox')
      .then((r) => r.json())
      .then((d) => setThreads(d.threads ?? []))
      .finally(() => setLoading(false));
  }, []);

  const active = threads.find((t) => t.id === activeThreadId) ?? null;

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <BackLink fallbackHref="/market" label="Back" />
        <h1 className="text-2xl font-bold text-foreground">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Trades, offers, orders, and listing questions — all in one place.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8">No conversations yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveThreadId(t.id)}
                  className={cn(
                    'w-full text-left rounded-xl border p-3 transition-colors',
                    activeThreadId === t.id
                      ? 'border-accent bg-accent/5'
                      : 'border-border bg-card hover:border-accent/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm font-medium', t.unread > 0 && 'text-foreground')}>
                      {t.label}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(t.last_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.preview}</p>
                  {t.unread > 0 ? (
                    <span className="inline-block mt-2 text-[10px] font-semibold text-accent">
                      {t.unread} unread
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {activeThreadId ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {active?.label ?? 'Conversation'}
                  </p>
                  {active?.href ? (
                    <Link href={active.href} className="text-xs text-accent hover:underline">
                      Open context
                    </Link>
                  ) : null}
                </div>
                <MessageThread
                  threadId={activeThreadId}
                  currentUserId={currentUserId}
                  showSenderName
                  placeholder="Write a message…"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
