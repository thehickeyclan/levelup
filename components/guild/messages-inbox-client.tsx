'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { MessageThread } from '@/components/guild/message-thread';
import { Button } from '@/components/ui/button';
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

type FilterTab = 'all' | 'coaching' | 'market';

const COACHING_TYPES = new Set([
  'session',
  'coach_inquiry',
  'session_change',
  'group_session',
]);

const MARKET_TYPES = new Set(['listing_qa', 'offer', 'trade', 'order']);

export function MessagesInboxClient({
  currentUserId,
  initialThreadId,
  showNewMessage,
}: {
  currentUserId: string;
  initialThreadId: string | null;
  showNewMessage?: boolean;
}) {
  const [threads, setThreads] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [filter, setFilter] = useState<FilterTab>('all');

  useEffect(() => {
    fetch('/api/guild/messages/inbox')
      .then((r) => r.json())
      .then((d) => setThreads(d.threads ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return threads;
    if (filter === 'coaching') return threads.filter((t) => COACHING_TYPES.has(t.thread_type));
    return threads.filter((t) => MARKET_TYPES.has(t.thread_type));
  }, [filter, threads]);

  const active = threads.find((t) => t.id === activeThreadId) ?? null;

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'coaching', label: 'Coaching' },
    { id: 'market', label: 'Market' },
  ];

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <BackLink fallbackHref="/dashboard" label="Back" />
            <h1 className="text-2xl font-bold text-foreground mt-2">Messages</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Coaches, sessions, small groups, and Guild Market — one inbox.
            </p>
          </div>
          {showNewMessage ? (
            <Button variant="outline" size="icon" className="shrink-0 mt-8" asChild>
              <Link href="/inbox/new" aria-label="New message">
                <Plus className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                filter === tab.id
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted-foreground hover:border-accent/40'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
            {showNewMessage ? (
              <Button asChild size="sm" className="bg-accent text-accent-foreground">
                <Link href="/inbox/new">Message a coach</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {filtered.map((t) => (
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
                  {active?.href && !active.href.startsWith('/messages?') ? (
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
                  maxHeight="420px"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
