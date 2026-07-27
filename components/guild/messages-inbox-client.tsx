'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { MessageThread } from '@/components/guild/message-thread';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { COACHING_THREAD_TYPES, MARKET_THREAD_TYPES } from '@/lib/guild-messaging';
import { CoachSessionMessagePanel } from '@/components/guild/coach-session-message-panel';

type InboxRow = {
  id: string;
  thread_type: string;
  label: string;
  preview: string;
  last_at: string;
  unread: number;
  href: string;
  category?: 'marketplace' | 'direct' | 'training';
  title?: string;
};

type FilterTab = 'all' | 'unread' | 'coaching' | 'market';

function formatInboxTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MessagesInboxClient({
  currentUserId,
  initialThreadId,
  showNewMessage,
  userRole = 'parent',
  showCoachSessionHub = false,
}: {
  currentUserId: string;
  initialThreadId: string | null;
  showNewMessage?: boolean;
  userRole?: string;
  showCoachSessionHub?: boolean;
}) {
  const isCoach = userRole === 'coach' || showCoachSessionHub;
  const [threads, setThreads] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [filter, setFilter] = useState<FilterTab>(isCoach ? 'coaching' : 'all');
  const [query, setQuery] = useState('');

  const loadInbox = (search = query) => {
    const params = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
    return fetch(`/api/guild/messages/inbox${params}`)
      .then((r) => r.json())
      .then((d) => setThreads(d.threads ?? []));
  };

  useEffect(() => {
    loadInbox().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInbox(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    if (filter === 'all') return threads;
    if (filter === 'unread') return threads.filter((t) => t.unread > 0);
    if (filter === 'coaching') {
      return threads.filter((t) => COACHING_THREAD_TYPES.has(t.thread_type as never));
    }
    return threads.filter((t) => MARKET_THREAD_TYPES.has(t.thread_type as never));
  }, [filter, threads]);

  const activeInFilter = filtered.some((t) => t.id === activeThreadId);
  const active = filtered.find((t) => t.id === activeThreadId) ?? null;

  const setFilterTab = (tab: FilterTab) => {
    setFilter(tab);
    setActiveThreadId((current) => {
      if (!current) return null;
      const list =
        tab === 'all'
          ? threads
          : tab === 'unread'
            ? threads.filter((t) => t.unread > 0)
            : tab === 'coaching'
            ? threads.filter((t) => COACHING_THREAD_TYPES.has(t.thread_type as never))
            : threads.filter((t) => MARKET_THREAD_TYPES.has(t.thread_type as never));
      return list.some((t) => t.id === current) ? current : null;
    });
  };

  const tabs: { id: FilterTab; label: string }[] = isCoach
    ? [{ id: 'coaching', label: 'Coaching' }]
    : [
        { id: 'all', label: 'All' },
        { id: 'unread', label: 'Unread' },
        { id: 'coaching', label: 'Coaching' },
        { id: 'market', label: 'Market' },
      ];

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <BackLink fallbackHref={isCoach ? '/athlete-dashboard' : '/dashboard'} label="Back" />
            <h1 className="text-2xl font-bold text-foreground mt-2">Messages</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isCoach
                ? 'Parents, sessions, and small groups — coaching messages only.'
                : 'Coaches, sessions, small groups, and Guild Market — one inbox.'}
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

        {showCoachSessionHub ? <CoachSessionMessagePanel /> : null}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people, sessions, listings, and messages"
            className="pl-9"
            aria-label="Search messages"
          />
        </div>

        <div className={cn('flex gap-2', tabs.length > 1 ? '' : 'hidden')}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
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
            <p className="text-sm text-muted-foreground">
              {query ? 'No conversations match your search.' : filter === 'unread' ? 'No unread conversations.' : 'No conversations yet.'}
            </p>
            {showNewMessage ? (
              <Button asChild size="sm" className="bg-accent text-accent-foreground">
                <Link href="/inbox/new">{isCoach ? 'Message a parent' : 'Message a coach'}</Link>
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
                    <p className={cn('text-sm font-medium', t.unread > 0 && 'text-foreground font-semibold')}>
                      {t.label}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatInboxTime(t.last_at)}
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-accent mt-1">
                    {t.category === 'marketplace' ? 'Marketplace' : t.category === 'direct' ? 'Direct message' : 'Training'}
                  </p>
                  <p className={cn('text-xs mt-1 line-clamp-2', t.unread > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                    {t.preview}
                  </p>
                  {t.unread > 0 ? (
                    <span className="inline-block mt-2 text-[10px] font-semibold text-accent">
                      {t.unread} unread
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {activeThreadId && activeInFilter ? (
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
                  onMessageSent={() => {
                    void loadInbox();
                  }}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
