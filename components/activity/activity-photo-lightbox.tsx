'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ActivityFeedPhoto } from '@/lib/activity-feed/types';
import {
  downloadActivityPhoto,
  shareActivityPhoto,
} from '@/lib/activity-feed/share-post-client';
import { cn } from '@/lib/utils';

type Props = {
  photos: ActivityFeedPhoto[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  shareCaption?: string;
};

export function ActivityPhotoLightbox({
  photos,
  initialIndex,
  open,
  onClose,
  shareCaption,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [action, setAction] = useState<'download' | 'share' | null>(null);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const goPrev = useCallback(() => {
    setIndex((current) => (current > 0 ? current - 1 : photos.length - 1));
  }, [photos.length]);

  const goNext = useCallback(() => {
    setIndex((current) => (current < photos.length - 1 ? current + 1 : 0));
  }, [photos.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (photos.length > 1 && e.key === 'ArrowLeft') goPrev();
      if (photos.length > 1 && e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, goPrev, goNext, photos.length]);

  const photo = photos[index];
  if (!open || !photo) return null;

  const onDownload = async () => {
    if (action) return;
    setAction('download');
    try {
      const ok = await downloadActivityPhoto(photo.url, photo.id);
      if (!ok) window.alert('Could not download photo. Try again.');
    } finally {
      setAction(null);
    }
  };

  const onShare = async () => {
    if (action) return;
    setAction('share');
    try {
      const outcome = await shareActivityPhoto(photo.url, photo.id, shareCaption);
      if (outcome === 'failed') {
        window.alert('Could not share photo. Try Download and post from Photos.');
      }
    } finally {
      setAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3 safe-area-inset-top">
        <div className="min-w-[4.5rem] text-sm text-white/80">
          {photos.length > 1 ? `${index + 1} / ${photos.length}` : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-white hover:bg-white/10 hover:text-white touch-manipulation"
            aria-label="Download photo"
            disabled={action !== null}
            onClick={() => void onDownload()}
          >
            {action === 'download' ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-5 w-5" aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-white hover:bg-white/10 hover:text-white touch-manipulation"
            aria-label="Share photo"
            disabled={action !== null}
            onClick={() => void onShare()}
          >
            {action === 'share' ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Share2 className="h-5 w-5" aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-white hover:bg-white/10 hover:text-white touch-manipulation"
            aria-label="Close photo viewer"
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="relative flex flex-1 min-h-0 items-center justify-center px-2 pb-4">
        {photos.length > 1 ? (
          <button
            type="button"
            className="absolute left-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 touch-manipulation md:left-3"
            aria-label="Previous photo"
            onClick={goPrev}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt=""
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />

        {photos.length > 1 ? (
          <button
            type="button"
            className="absolute right-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 touch-manipulation md:right-3"
            aria-label="Next photo"
            onClick={goNext}
          >
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
        ) : null}
      </div>

      {photos.length > 1 ? (
        <div className="flex justify-center gap-1.5 px-4 pb-6 safe-area-inset-bottom">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`View photo ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all touch-manipulation',
                i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'
              )}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : (
        <div className="pb-6 safe-area-inset-bottom" />
      )}
    </div>
  );
}
