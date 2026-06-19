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
  const cleanUrl = image.clean_public_url ?? null;
  const active = Boolean(image.use_clean && cleanUrl);

  async function handleClean() {
    setLoading(true);
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
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const next = !active;
    onUpdate(image.id, { use_clean: next });
    await fetch(`/api/market/listings/${listingId}/images/${image.id}/toggle-clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useClean: next }),
    });
  }

  return (
    <div className="flex items-center gap-2 mt-1.5">
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
          {active ? 'Clean bg on' : 'Show original'}
        </button>
      )}
    </div>
  );
}

export function photoThumbnailSrc(image: MarketListingImageRow & { id: string }): string {
  return listingImageDisplayUrl(image);
}
