'use client';

import { useCallback, useMemo, useState } from 'react';
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
  const [imgError, setImgError] = useState(false);

  const isSingle = scope === 'single-session';

  const imageUrl = useMemo(() => {
    if (isSingle && sessionId) {
      return `/api/sessions/${sessionId}/share-image?theme=${theme}&t=${theme}`;
    }
    return `/api/coaches/${coachId}/share-image?theme=${theme}&t=${theme}`;
  }, [coachId, sessionId, theme, isSingle]);

  const fetchBlob = useCallback(async () => {
    const res = await fetch(imageUrl);
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
        <div>
          <p className="font-semibold text-foreground">Instagram graphic</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isSingle ? (
              <>
                This session only — time, spots, and how to book (domain + QR to this session&apos;s
                signup link).
              </>
            ) : (
              <>
                Every upcoming session — times, spots, and how to book (domain + QR to your schedule
                page).
              </>
            )}
            {scheduleUrl && !isSingle ? (
              <>
                {' '}
                Caption can include your all-sessions link (
                <span className="break-all">{scheduleUrl}</span>).
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Brand template</Label>
        <Select value={theme} onValueChange={(v) => { setTheme(v as ShareGraphicThemeId); setImgError(false); }}>
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
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={isSingle ? 'Session share preview' : 'All sessions share preview'}
            className="w-full h-auto block"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="aspect-[3/4] flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
            Preview unavailable. Try Download.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          className="min-h-[44px] flex-1 sm:flex-none gap-2"
          disabled={loading !== null}
          onClick={() => void handleShare()}
        >
          {loading === 'share' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          Share
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] flex-1 sm:flex-none gap-2"
          disabled={loading !== null}
          onClick={() => void handleDownload()}
        >
          {loading === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download
        </Button>
      </div>
    </div>
  );
}

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
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      <Button
        type="button"
        variant={scope === 'single-session' ? 'default' : 'outline'}
        className={cn(
          'min-h-[44px] text-left justify-start px-3 h-auto py-2.5 flex-col items-start gap-0.5',
          scope === 'single-session' && 'bg-accent text-black hover:bg-accent-hover'
        )}
        onClick={() => onScopeChange('single-session')}
      >
        <span className="font-semibold text-sm">Just this session</span>
        <span className="text-[11px] opacity-80 font-normal">One time slot for Instagram</span>
      </Button>
      <Button
        type="button"
        variant={scope === 'all-sessions' ? 'default' : 'outline'}
        className={cn(
          'min-h-[44px] text-left justify-start px-3 h-auto py-2.5 flex-col items-start gap-0.5',
          scope === 'all-sessions' && 'bg-accent text-black hover:bg-accent-hover'
        )}
        onClick={() => onScopeChange('all-sessions')}
      >
        <span className="font-semibold text-sm">All my sessions</span>
        <span className="text-[11px] opacity-80 font-normal">Weekly roundup post</span>
      </Button>
    </div>
  );
}
