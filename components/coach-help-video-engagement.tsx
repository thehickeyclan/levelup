'use client';

import { useCallback, useState } from 'react';
import { ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CoachHelpVideoSummary = {
  myViewCount: number;
  upCount: number;
  downCount: number;
  myVote: number | null;
};

type Props = {
  videoKey: string;
  embedSrc: string | null;
  watchUrl: string;
  iframeTitle: string;
  initialSummary: CoachHelpVideoSummary;
};

async function fetchSummary(videoKey: string): Promise<CoachHelpVideoSummary> {
  const res = await fetch(`/api/coach-help/summary?videoKey=${encodeURIComponent(videoKey)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Summary failed');
  return {
    myViewCount: Number(data.myViewCount ?? 0),
    upCount: Number(data.upCount ?? 0),
    downCount: Number(data.downCount ?? 0),
    myVote: data.myVote === 1 || data.myVote === -1 ? data.myVote : null,
  };
}

export function CoachHelpVideoEngagement({
  videoKey,
  embedSrc,
  watchUrl,
  iframeTitle,
  initialSummary,
}: Props) {
  const [summary, setSummary] = useState(initialSummary);
  const [voteBusy, setVoteBusy] = useState(false);

  const logView = useCallback(() => {
    void fetch('/api/coach-help/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoKey }),
    })
      .then((res) => (res.ok ? fetchSummary(videoKey) : null))
      .then((next) => {
        if (next) setSummary(next);
      })
      .catch(() => {});
  }, [videoKey]);

  async function setVote(next: 1 | -1 | 0) {
    setVoteBusy(true);
    try {
      const res = await fetch('/api/coach-help/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoKey, vote: next }),
      });
      if (!res.ok) return;
      const s = await fetchSummary(videoKey);
      setSummary(s);
    } finally {
      setVoteBusy(false);
    }
  }

  function onThumb(v: 1 | -1) {
    if (voteBusy) return;
    if (summary.myVote === v) void setVote(0);
    else void setVote(v);
  }

  return (
    <div className="space-y-4">
      {embedSrc ? (
        <div className="rounded-lg overflow-hidden border bg-black aspect-video">
          <iframe
            title={iframeTitle}
            src={embedSrc}
            className="w-full h-full min-h-[200px]"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            onLoad={logView}
          />
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Button
          asChild
          className="min-h-[44px] bg-accent hover:bg-accent-hover text-black font-semibold w-full sm:w-auto"
        >
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2"
            onClick={logView}
          >
            {embedSrc ? 'Open in new tab' : 'Watch the video'}
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          </a>
        </Button>
        {!embedSrc ? (
          <span className="text-xs sm:text-sm text-muted-foreground">
            Opens your video host in a new tab — use a YouTube or Loom watch/share link for an in-page player.
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 pt-3 text-sm">
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">{summary.myViewCount}</span>{' '}
          {summary.myViewCount === 1 ? 'time' : 'times'} you&apos;ve opened this tutorial (this page counts when the
          player loads or you use the button above).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground mr-1">Was this helpful?</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={voteBusy}
            className={cn('min-h-[40px] gap-1.5', summary.myVote === 1 && 'border-accent bg-accent/10')}
            onClick={() => onThumb(1)}
          >
            <ThumbsUp className="h-4 w-4" aria-hidden />
            Helpful
            <span className="text-muted-foreground tabular-nums">({summary.upCount})</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={voteBusy}
            className={cn('min-h-[40px] gap-1.5', summary.myVote === -1 && 'border-destructive/60 bg-destructive/5')}
            onClick={() => onThumb(-1)}
          >
            <ThumbsDown className="h-4 w-4" aria-hidden />
            Not yet
            <span className="text-muted-foreground tabular-nums">({summary.downCount})</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
