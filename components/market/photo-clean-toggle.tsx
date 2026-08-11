'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react';
import { listingImageDisplayUrl, type MarketListingImageRow } from '@/lib/market/listing-images';

export function PhotoCleanToggle({
  listingId,
  image,
  onUpdate,
}: {
  listingId: string;
  image: MarketListingImageRow & { id: string };
  onUpdate: (imageId: string, patch: Partial<MarketListingImageRow>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanUrl = image.clean_public_url ?? null;
  const active = Boolean(image.use_clean && cleanUrl);

  async function handleClean() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/market/listings/${listingId}/images/${image.id}/clean`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (data.success && data.cleanUrl) {
        onUpdate(image.id, {
          clean_public_url: data.cleanUrl,
          use_clean: true,
        });
        return;
      }
      setError(data.error || 'Could not clean background — original photo is still saved.');
    } catch {
      setError('Could not clean background — original photo is still saved.');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const next = !active;
    onUpdate(image.id, { use_clean: next });
    setError(null);
    try {
      const res = await fetch(`/api/market/listings/${listingId}/images/${image.id}/toggle-clean`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useClean: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not update background choice.');
      }
    } catch (err) {
      onUpdate(image.id, { use_clean: active });
      setError(err instanceof Error ? err.message : 'Could not update background choice.');
    }
  }

  return (
    <div className="mt-1.5 space-y-1">
      {!cleanUrl ? (
        <button
          type="button"
          onClick={() => void handleClean()}
          disabled={loading}
          className="text-[10px] text-accent flex items-center gap-1 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Cleaning…
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              Clean background
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleToggle()}
          className={`text-[10px] flex items-center gap-1 ${
            active ? 'text-accent' : 'text-muted-foreground'
          }`}
        >
          {active ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <Circle className="h-3 w-3" />
          )}
          {active ? 'Clean bg on' : 'Use clean bg'}
        </button>
      )}
      {error ? <p className="text-[10px] leading-tight text-destructive">{error}</p> : null}
    </div>
  );
}

export function photoThumbnailSrc(image: MarketListingImageRow & { id: string }): string {
  return listingImageDisplayUrl(image);
}
