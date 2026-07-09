'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ImageIcon, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SHARE_GRAPHIC_THEMES,
  SHARE_GRAPHIC_THEME_IDS,
  type ShareGraphicThemeId,
} from '@/lib/session-share-graphic/themes';
import { cn } from '@/lib/utils';

export type ShareGraphicScope = 'all-sessions' | 'single-session';

type Props = {
  coachId: string;
  /** Defaults to all-sessions when omitted. */
  scope?: ShareGraphicScope;
  /** Required when scope is single-session. */
  sessionId?: string;
  defaultTheme: ShareGraphicThemeId;
  shareCaption?: string;
  scheduleUrl?: string;
  className?: string;
};

export function SessionShareGraphicPanel({
  coachId,
  scope = 'all-sessions',
  sessionId,
  defaultTheme,
  shareCaption,
  scheduleUrl,
  className,
}: Props) {
  const [theme, setTheme] = useState<ShareGraphicThemeId>(defaultTheme);
  const [loading, setLoading] = useState<'download' | 'share' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);

  const isSingle = scope === 'single-session';

  const imageUrl = useMemo(() => {
    if (isSingle && sessionId) {
      return `/api/sessions/${sessionId}/share-image?theme=${theme}`;
    }
    return `/api/coaches/${coachId}/share-image?theme=${theme}`;
  }, [coachId, sessionId, theme, isSingle]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setPreviewLoading(true);
    setPreviewError(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    void fetch(imageUrl, { credentials: 'include', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Preview failed (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        setPreviewUrl(URL.createObjectURL(blob));
        setPreviewLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled || (err as Error)?.name === 'AbortError') return;
        setPreviewError(true);
        setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [imageUrl]);

  const fetchBlob = useCallback(async () => {
    const res = await fetch(imageUrl, { credentials: 'include' });
    if (!res.ok) throw new Error('Could not generate graphic');
    return res.blob();
  }, [imageUrl]);

  const downloadName = isSingle
    ? `guild-session-${sessionId?.slice(0, 8) ?? 'one'}.png`
    : `guild-sessions-${coachId.slice(0, 8)}.png`;

  const handleDownload = async () => {
    setLoading('download');
    try {
      const blob = await fetchBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('Could not download graphic. Try again.');
    } finally {
      setLoading(null);
    }
  };

  const handleShare = async () => {
    setLoading('share');
    try {
      const blob = await fetchBlob();
      const file = new File([blob], downloadName, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: isSingle ? 'Guild session' : 'Guild sessions',
          text: shareCaption,
        });
      } else {
        await handleDownload();
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        window.alert('Share failed. Use Download and post from Photos.');
      }
    } finally {
      setLoading(null);
    }
  };

  if (isSingle && !sessionId) {
    return (
      <p className="text-sm text-muted-foreground">Pick a session to preview its graphic.</p>
    );
  }

  return (
    <div className={className ?? 'rounded-xl border border-accent/30 bg-card p-4 space-y-4'}>
      <div className="flex items-start gap-2">
        <ImageIcon className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-foreground">Instagram graphic</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isSingle
              ? 'This session’s time and spots — QR goes to your full schedule.'
              : 'All upcoming sessions — times, spots, and a schedule QR.'}
          </p>
          {scheduleUrl && !isSingle ? (
            <p className="text-[11px] text-muted-foreground leading-snug">
              <span className="font-medium text-foreground/80">Caption link: </span>
              <span className="break-all">{scheduleUrl}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Brand template</Label>
        <Select value={theme} onValueChange={(v) => setTheme(v as ShareGraphicThemeId)}>
          <SelectTrigger className="min-h-[44px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHARE_GRAPHIC_THEME_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {SHARE_GRAPHIC_THEMES[id].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mx-auto w-full max-w-[240px] overflow-hidden rounded-lg border border-border bg-black shadow-lg">
        {previewLoading ? (
          <div className="aspect-[3/4] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading preview" />
          </div>
        ) : previewError || !previewUrl ? (
          <div className="aspect-[3/4] flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
            Preview unavailable. Try Download.
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={isSingle ? 'Session share preview' : 'All sessions share preview'}
            className="w-full h-auto block"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          className="min-h-[44px] flex-1 sm:flex-none gap-2"
          disabled={loading !== null || previewLoading}
          onClick={() => void handleShare()}
        >
          {loading === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          Share
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] flex-1 sm:flex-none gap-2"
          disabled={loading !== null || previewLoading}
          onClick={() => void handleDownload()}
        >
          {loading === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download
        </Button>
      </div>
    </div>
  );
}

const SCOPE_OPTIONS: { id: ShareGraphicScope; title: string; description: string }[] = [
  { id: 'single-session', title: 'Just this session', description: 'One time slot' },
  { id: 'all-sessions', title: 'All my sessions', description: 'Weekly roundup' },
];

/** Toggle for choosing all-sessions vs single-session graphic. */
export function ShareGraphicScopePicker({
  scope,
  onScopeChange,
  className,
}: {
  scope: ShareGraphicScope;
  onScopeChange: (scope: ShareGraphicScope) => void;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-2', className)} role="group" aria-label="Graphic scope">
      {SCOPE_OPTIONS.map((option) => {
        const selected = scope === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onScopeChange(option.id)}
            className={cn(
              'rounded-lg border-2 px-3 py-3 text-left transition-colors touch-manipulation',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected
                ? 'border-accent bg-accent text-black'
                : 'border-border bg-card text-foreground hover:border-accent/60'
            )}
          >
            <span className="block font-semibold text-sm leading-tight">{option.title}</span>
            <span
              className={cn(
                'block text-xs mt-1 leading-snug',
                selected ? 'text-black/70' : 'text-muted-foreground'
              )}
            >
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
