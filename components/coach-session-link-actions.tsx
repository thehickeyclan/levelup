'use client';

import { useState } from 'react';
import { Check, Link2, MessageCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';
import {
  buildCoachSessionShareMessage,
  coachSessionShareUrl,
  type CoachSessionShareInput,
} from '@/lib/coach-session-share';
import { cn } from '@/lib/utils';

type Props = {
  session: CoachSessionShareInput;
  coachDisplayName: string;
  facility?: string;
  className?: string;
  /** When true, only Copy link + Share (fits tight schedule card row). */
  compact?: boolean;
};

export function CoachSessionLinkActions({
  session,
  coachDisplayName,
  facility,
  className,
  compact = false,
}: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');

  const getSharePayload = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = coachSessionShareUrl(origin, session);
    const text = buildCoachSessionShareMessage({
      coachName: coachDisplayName,
      session,
      facility,
      url,
    });
    return { url, text };
  };

  const onCopyLink = async () => {
    const { text } = getSharePayload();
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    }
  };

  const onShare = async () => {
    const { url, text } = getSharePayload();
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Guild session',
          text,
          url,
        });
        return;
      }
    } catch {
      /* cancelled or unavailable */
    }
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setShareState('copied');
      window.setTimeout(() => setShareState('idle'), 2000);
    }
  };

  const onTextLink = () => {
    const { text } = getSharePayload();
    window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
  };

  const copyLabel = copyState === 'copied' ? 'Copied!' : compact ? 'Copy link' : 'Copy session link';
  const shareLabel = shareState === 'copied' ? 'Copied!' : 'Share';

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        className="min-h-[44px] touch-manipulation flex-1 min-w-[7.5rem] border-[#D4AF37]/40"
        onClick={() => void onCopyLink()}
      >
        {copyState === 'copied' ? (
          <>
            <Check className="h-4 w-4 mr-2 text-emerald-500 shrink-0" />
            {copyLabel}
          </>
        ) : (
          <>
            <Link2 className="h-4 w-4 mr-2 shrink-0" />
            {copyLabel}
          </>
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-[44px] touch-manipulation flex-1 min-w-[7.5rem] border-[#D4AF37]/40"
        onClick={() => void onShare()}
      >
        {shareState === 'copied' ? (
          <>
            <Check className="h-4 w-4 mr-2 text-emerald-500 shrink-0" />
            {shareLabel}
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4 mr-2 shrink-0" />
            {shareLabel}
          </>
        )}
      </Button>
      {!compact && (
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] touch-manipulation flex-1 min-w-[7.5rem] border-[#D4AF37]/40"
          onClick={onTextLink}
        >
          <MessageCircle className="h-4 w-4 mr-2 shrink-0" />
          Text link
        </Button>
      )}
    </div>
  );
}
