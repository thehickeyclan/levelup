'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ProfileImage } from '@/components/profile-image';
import { useGuildThreadMessages } from '@/lib/hooks/use-guild-thread-messages';
import { cn } from '@/lib/utils';
import type { GuildMessageDeliveryChannel } from '@/lib/guild-messaging';

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
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
  const [deliveryChannel, setDeliveryChannel] = useState<GuildMessageDeliveryChannel>('in_app');
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);
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
    setDeliveryNotice(null);
    try {
      const res = await fetch(`/api/guild/messages/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, deliveryChannel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setDraft('');
      if (deliveryChannel === 'sms') {
        const smsRecipients = Number(data.message?.sms_recipients ?? 0);
        setDeliveryNotice(
          smsRecipients > 0
            ? `Text sent to ${smsRecipients} recipient${smsRecipients === 1 ? '' : 's'} and saved here.`
            : 'Saved here, but no recipient could receive SMS. They may have no phone on file or opted out.'
        );
      }
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

  const reportMessage = async (messageId: string) => {
    const details = window.prompt('Briefly describe the concern. This is sent privately to Guild staff.');
    if (details === null) return;
    const res = await fetch('/api/guild/messages/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId,
        messageId,
        reason: 'other',
        details,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Could not submit report');
      return;
    }
    setSafetyNotice('Report submitted privately to Guild staff.');
  };

  const blockSender = async (blockedUserId: string) => {
    if (!window.confirm('Block this person? Direct messages between you will stop.')) return;
    const res = await fetch('/api/guild/messages/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockedUserId, threadId }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Could not block this person');
      return;
    }
    setSafetyNotice('User blocked. You can still report individual messages to Guild staff.');
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
            const seen = own && m.read_by.some((readerId) => readerId !== currentUserId);
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
                    {formatMessageTime(m.created_at)}{seen ? ' · Read' : ''}
                  </p>
                  {!own ? (
                    <div className="flex gap-2 mt-1 px-0.5">
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={() => void reportMessage(m.id)}
                      >
                        Report
                      </button>
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={() => void blockSender(m.sender_id)}
                      >
                        Block
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!readOnly ? (
        <div className="border-t border-border p-2 bg-background space-y-2">
          <div className="flex gap-1" role="group" aria-label="How to send">
            <Button
              type="button"
              size="sm"
              variant={deliveryChannel === 'in_app' ? 'default' : 'outline'}
              className="h-8 gap-1.5 text-xs"
              onClick={() => setDeliveryChannel('in_app')}
              disabled={sending}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Guild message
            </Button>
            <Button
              type="button"
              size="sm"
              variant={deliveryChannel === 'sms' ? 'default' : 'outline'}
              className="h-8 gap-1.5 text-xs"
              onClick={() => setDeliveryChannel('sms')}
              disabled={sending}
            >
              <Smartphone className="h-3.5 w-3.5" />
              SMS
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {deliveryChannel === 'sms'
              ? 'Send as a text and save a copy in this Guild conversation.'
              : 'Send in the Guild with an app notification.'}
          </p>
          <div className="flex gap-2 items-end">
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
              aria-label={deliveryChannel === 'sms' ? 'Send SMS' : 'Send Guild message'}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {deliveryNotice ? <p className="text-xs text-muted-foreground">{deliveryNotice}</p> : null}
        </div>
      ) : null}
      {!readOnly && draft.length > 800 ? (
        <p className="text-[10px] text-muted-foreground px-3 pb-2">{draft.length}/1000</p>
      ) : null}
      {safetyNotice ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {safetyNotice}
        </p>
      ) : null}
    </div>
  );
}
