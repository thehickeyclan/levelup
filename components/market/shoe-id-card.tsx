'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';
import { cn } from '@/lib/utils';

export type ShoeIdAcceptPayload = {
  brand: string;
  model: string;
  colorway?: string;
};

export function ShoeIdCard({
  listingId,
  images,
  onAccept,
}: {
  listingId: string;
  images: { public_url: string }[];
  onAccept: (payload: ShoeIdAcceptPayload) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShoeIdResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const identify = async () => {
    if (!images.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/market/shoe-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          images: images.map((i) => i.public_url),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Identification failed');
      setResult(data.result);
      setExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Identification failed');
    } finally {
      setLoading(false);
    }
  };

  if (!images.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      <button
        type="button"
        onClick={() => {
          if (!result) void identify();
          else setExpanded((v) => !v);
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-accent transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Identify this shoe
        </span>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        )}
      </button>
      {error ? <p className="px-4 pb-3 text-xs text-destructive">{error}</p> : null}
      {expanded && result ? (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {images.length < 3 ? (
            <p className="text-[10px] text-muted-foreground">
              Tip: add top, sole, and side photos for better IDs — using {images.length}{' '}
              photo{images.length !== 1 ? 's' : ''}.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Analyzing {images.length} angles together (top, sides, sole, etc.).
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Brand</dt>
            <dd className="text-foreground font-medium">{result.brand}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="text-foreground font-medium">{result.model}</dd>
            <dt className="text-muted-foreground">Colorway</dt>
            <dd className="text-foreground font-medium">{result.colorway || '—'}</dd>
            <dt className="text-muted-foreground">Era</dt>
            <dd className="text-muted-foreground">{result.era}</dd>
            <dt className="text-muted-foreground">Rarity</dt>
            <dd className="text-muted-foreground capitalize">{result.rarity}</dd>
            <dt className="text-muted-foreground">Est. value</dt>
            <dd className="text-accent">
              ${Math.round(result.value_low_cents / 100)}–$
              {Math.round(result.value_high_cents / 100)}
            </dd>
            <dt className="text-muted-foreground">Confidence</dt>
            <dd className="text-muted-foreground">{Math.round(result.confidence * 100)}%</dd>
          </dl>
          <Button
            type="button"
            size="sm"
            className="w-full bg-accent text-accent-foreground"
            onClick={() =>
              onAccept({
                brand: result.brand,
                model: result.model,
                colorway: result.colorway,
              })
            }
          >
            Use this identification
          </Button>
        </div>
      ) : null}
    </div>
  );
}
