'use client';

import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
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
};

export function CoachSessionLinkActions({
  session,
  coachDisplayName,
  facility,
  className,
}: Props) {
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');

  const onShare = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = coachSessionShareUrl(origin, session);
    const text = buildCoachSessionShareMessage({
      coachName: coachDisplayName,
      session,
      facility,
      url,
    });

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

  const shareLabel = shareState === 'copied' ? 'Copied!' : 'Share';

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        className="min-h-[44px] touch-manipulation flex-1 min-w-[7.5rem] border-accent/40"
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
    </div>
  );
}
