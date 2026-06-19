'use client';

import { useEffect, useState } from 'react';
import { MessageThread } from '@/components/guild/message-thread';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

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
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const isSeller = currentUserId === sellerId;

  useEffect(() => {
    fetch(`/api/market/listings/${listingId}/qa`)
      .then((r) => r.json())
      .then((d) => setThreadId(d.thread_id ?? null))
      .catch(() => {});
  }, [listingId]);

  const ask = async () => {
    const text = question.trim();
    if (!text || asking) return;
    setAsking(true);
    try {
      const res = await fetch(`/api/market/listings/${listingId}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setThreadId(data.thread_id);
      setQuestion('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAsking(false);
    }
  };

  return (
    <section className="mt-6 border-t border-border pt-6 space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Questions</h3>
      {threadId ? (
        <MessageThread
          threadId={threadId}
          currentUserId={currentUserId ?? ''}
          isPublic
          showSenderName
          placeholder={isSeller ? 'Reply to buyers…' : 'Ask a question…'}
          maxHeight="280px"
        />
      ) : (
        <p className="text-xs text-muted-foreground">No questions yet.</p>
      )}
      {!isSeller && currentUserId ? (
        <div className="flex gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, 500))}
            placeholder="Ask about size, condition, or shipping…"
            rows={2}
            className="text-sm resize-none"
          />
          <Button
            type="button"
            className="shrink-0 bg-accent text-accent-foreground"
            disabled={!question.trim() || asking}
            onClick={() => void ask()}
          >
            Ask
          </Button>
        </div>
      ) : null}
      {!currentUserId ? (
        <p className="text-xs text-muted-foreground">Sign in to ask a question.</p>
      ) : null}
    </section>
  );
}
