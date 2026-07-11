'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ProfileImage } from '@/components/profile-image';
import { useGuildThreadMessages } from '@/lib/hooks/use-guild-thread-messages';
import { cn } from '@/lib/utils';

export type MessageThreadProps = {
  threadId: string;
  currentUserId: string;
  isPublic?: boolean;
  placeholder?: string;
  maxHeight?: string;
  showSenderName?: boolean;
  readOnly?: boolean;
  /** Scroll the thread panel when messages load (default true). Disable on listing Q&A so the product page stays at the top. */
  scrollOnLoad?: boolean;
  onMessageSent?: () => void;
};

function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return '';
  }
}

function SenderAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  const initial = (name || 'M').charAt(0).toUpperCase();
  if (photoUrl) {
    return (
      <ProfileImage
        src={photoUrl}
        alt={name}
        className={cn('w-8 h-8 shrink-0 border border-border/60', className)}
        fallbackIconClassName="h-4 w-4 text-muted-foreground"
      />
    );
  }
  return (
    <div
      className={cn(
        'w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center shrink-0',
        className
      )}
    >
      {initial}
    </div>
  );
}

export function MessageThread({
  threadId,
  currentUserId,
  placeholder = 'Write a message…',
  maxHeight = '320px',
  showSenderName = false,
  readOnly = false,
  scrollOnLoad = true,
  onMessageSent,
}: MessageThreadProps) {
  const { messages, loading, error, refresh } = useGuildThreadMessages(threadId, currentUserId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const hasLoadedMessagesRef = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el || loading) return;

    const isFirstLoad = !hasLoadedMessagesRef.current;
    if (isFirstLoad) {
      hasLoadedMessagesRef.current = true;
      if (!scrollOnLoad) return;
    }

    el.scrollTo({ top: el.scrollHeight, behavior: isFirstLoad ? 'auto' : 'smooth' });
  }, [messages.length, loading, scrollOnLoad]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || readOnly) return;
    setSending(true);
    try {
      const res = await fetch(`/api/guild/messages/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setDraft('');
      await refresh();
      onMessageSent?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card flex flex-col">
      <div
        ref={listRef}
        className="overflow-y-auto p-3 space-y-4"
        style={{ maxHeight }}
      >
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">Loading messages…</p>
        ) : error ? (
          <p className="text-xs text-destructive text-center py-6">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const own = m.sender_id === currentUserId;
            const displayName = own ? 'You' : (m.sender_name || 'Member');
            return (
              <div
                key={m.id}
                className={cn('flex gap-2.5 items-end', own ? 'flex-row-reverse' : 'flex-row')}
              >
                {showSenderName ? (
                  <SenderAvatar
                    name={displayName}
                    photoUrl={m.sender_photo_url}
                    className={
                      own
                        ? 'bg-accent/25 text-accent ring-1 ring-accent/40'
                        : 'bg-slate-600/50 text-slate-200 ring-1 ring-slate-500/50'
                    }
                  />
                ) : null}
                <div
                  className={cn(
                    'flex flex-col max-w-[78%] min-w-0',
                    own ? 'items-end' : 'items-start'
                  )}
                >
                  {showSenderName ? (
                    <p
                      className={cn(
                        'text-[11px] font-medium mb-1 px-0.5',
                        own ? 'text-accent' : 'text-slate-300'
                      )}
                    >
                      {displayName}
                    </p>
                  ) : null}
                  <div
                    className={cn(
                      'px-3 py-2 text-sm break-words shadow-sm',
                      own
                        ? 'bg-accent text-primary rounded-2xl rounded-br-sm'
                        : 'bg-slate-700/90 text-slate-50 border border-slate-500/40 rounded-2xl rounded-bl-sm'
                    )}
                  >
                    {m.body}
                  </div>
                  <p className={cn('text-[10px] text-muted-foreground mt-1 px-0.5', own && 'text-right')}>
                    {formatMessageTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!readOnly ? (
        <div className="border-t border-border p-2 flex gap-2 items-end bg-background">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            className="min-h-[40px] max-h-[72px] resize-none text-sm"
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0 bg-accent text-accent-foreground"
            disabled={!draft.trim() || sending}
            onClick={() => void send()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      ) : null}
      {!readOnly && draft.length > 800 ? (
        <p className="text-[10px] text-muted-foreground px-3 pb-2">{draft.length}/1000</p>
      ) : null}
    </div>
  );
}
