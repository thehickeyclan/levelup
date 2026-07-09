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

type Props = {
  sessionId: string;
  defaultTheme: ShareGraphicThemeId;
  shareCaption?: string;
  className?: string;
};

export function SessionShareGraphicPanel({
  sessionId,
  defaultTheme,
  shareCaption,
  className,
}: Props) {
  const [theme, setTheme] = useState<ShareGraphicThemeId>(defaultTheme);
  const [loading, setLoading] = useState<'download' | 'share' | null>(null);
  const [imgError, setImgError] = useState(false);

  const imageUrl = useMemo(
    () => `/api/sessions/${sessionId}/share-image?theme=${theme}&t=${theme}`,
    [sessionId, theme]
  );

  const fetchBlob = useCallback(async () => {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error('Could not generate graphic');
    return res.blob();
  }, [imageUrl]);

  const handleDownload = async () => {
    setLoading('download');
    try {
      const blob = await fetchBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `guild-session-${sessionId.slice(0, 8)}.png`;
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
      const file = new File([blob], `guild-session.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Guild session',
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

  return (
    <div className={className ?? 'rounded-xl border border-accent/30 bg-card p-4 space-y-4'}>
      <div className="flex items-start gap-2">
        <ImageIcon className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-semibold text-foreground">Instagram graphic</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Download or share — post to feed or story with your booking link in bio or caption.
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
            alt="Session share preview"
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
