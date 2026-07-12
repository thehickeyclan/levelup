'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { MessageThread } from '@/components/guild/message-thread';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { GuildMessageRow } from '@/lib/guild-messaging';

type QaPair = {
  question: GuildMessageRow;
  answer: GuildMessageRow | null;
};

function formatAskedAt(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return '';
  }
}

function buildQaPairs(messages: GuildMessageRow[], sellerId: string): QaPair[] {
  const pairs: QaPair[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.sender_id === sellerId) {
      i += 1;
      continue;
    }
    const answer =
      messages[i + 1]?.sender_id === sellerId ? messages[i + 1] : null;
    pairs.push({ question: msg, answer });
    i += answer ? 2 : 1;
  }
  return pairs;
}

function senderHandle(name: string): string {
  const trimmed = name.trim() || 'Member';
  const handle = trimmed.replace(/\s+/g, '').toLowerCase();
  return `@${handle}`;
}

export function ListingQaSection({
  listingId,
  sellerId,
  currentUserId,
}: {
  listingId: string;
  sellerId: string;
  currentUserId: string | null;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GuildMessageRow[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [showAskForm, setShowAskForm] = useState(false);
  const isSeller = currentUserId === sellerId;

  const loadQa = useCallback(async () => {
    const res = await fetch(`/api/market/listings/${listingId}/qa`);
    const data = await res.json();
    setThreadId(data.thread_id ?? null);
    setMessages(Array.isArray(data.messages) ? data.messages : []);
  }, [listingId]);

  useEffect(() => {
    void loadQa();
  }, [loadQa]);

  const qaPairs = useMemo(() => buildQaPairs(messages, sellerId), [messages, sellerId]);

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      const res = await fetch(`/api/market/listings/${listingId}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      let data: { error?: string; thread_id?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error('Could not post question. Please try again.');
      }
      if (!res.ok) throw new Error(data.error || 'Could not post question');
      if (!data.thread_id) throw new Error('Question posted but thread could not load.');
      setThreadId(data.thread_id);
      setQuestion('');
      setShowAskForm(false);
      await loadQa();
    } catch (e) {
      setAskError(e instanceof Error ? e.message : 'Could not post question');
    } finally {
      setAsking(false);
    }
  };

  return (
    <section className="border-t border-accent/20 pt-6 space-y-4">
      <h3 className="text-[10px] font-medium uppercase tracking-[0.15em] text-accent">Questions</h3>

      {qaPairs.length ? (
        <div className="space-y-3">
          {qaPairs.map(({ question: q, answer }) => (
            <div key={q.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-sm text-foreground leading-relaxed">&ldquo;{q.body}&rdquo;</p>
              <p className="text-xs text-muted-foreground">
                {senderHandle(q.sender_name ?? 'Member')} · {formatAskedAt(q.created_at)}
              </p>
              {answer ? (
                <div className="border-t border-border/60 pt-2 mt-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Seller reply</p>
                  <p className="text-sm text-foreground/90 leading-relaxed">{answer.body}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">No questions yet.</p>
          <p className="text-xs text-muted-foreground">Be the first to ask about this shoe.</p>
        </div>
      )}

      {!isSeller && currentUserId ? (
        <div className="space-y-3">
          {!showAskForm ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] rounded-full border-accent text-accent hover:bg-accent/10 hover:text-accent"
              onClick={() => setShowAskForm(true)}
            >
              Ask a question
            </Button>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, 500))}
                placeholder="Ask the seller anything about this shoe..."
                rows={3}
                className="text-sm resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="min-h-[44px] bg-accent text-accent-foreground"
                  disabled={!question.trim() || asking}
                  onClick={() => void ask()}
                >
                  {asking ? 'Sending…' : 'Send question'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={() => {
                    setShowAskForm(false);
                    setAskError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {askError ? <p className="text-xs text-destructive">{askError}</p> : null}
        </div>
      ) : null}

      {!currentUserId ? (
        <p className="text-sm text-muted-foreground">
          <Link href={`/login?redirect=/market/listing/${listingId}`} className="text-accent hover:underline">
            Sign in
          </Link>{' '}
          to ask a question.
        </p>
      ) : null}

      {isSeller && threadId ? (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground">Reply to buyers</p>
          <MessageThread
            threadId={threadId}
            currentUserId={currentUserId ?? ''}
            isPublic
            showSenderName
            placeholder="Reply to buyers…"
            maxHeight="220px"
            scrollOnLoad={false}
            onMessageSent={() => void loadQa()}
          />
        </div>
      ) : null}
    </section>
  );
}
