'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';
import { normalizeMarketBrand } from '@/lib/market/brands';
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
  externalResult = null,
  externalLoading = false,
  autoApplied = false,
  userLocked = false,
  formBrand = '',
  formModel = '',
}: {
  listingId: string;
  images: { public_url: string }[];
  onAccept: (payload: ShoeIdAcceptPayload, opts?: { colorwayOnly?: boolean }) => void;
  externalResult?: ShoeIdResult | null;
  externalLoading?: boolean;
  autoApplied?: boolean;
  /** User set brand/model manually — AI must not overwrite identity fields. */
  userLocked?: boolean;
  formBrand?: string;
  formModel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localResult, setLocalResult] = useState<ShoeIdResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result = externalResult ?? localResult;
  const busy = loading || externalLoading;

  const aiBrand = result ? normalizeMarketBrand(result.brand) : '';
  const yourBrand = formBrand ? normalizeMarketBrand(formBrand) : '';
  const aiModel = result?.model?.trim() ?? '';
  const yourModel = formModel.trim();
  const identityMismatch =
    userLocked &&
    result &&
    ((yourBrand && aiBrand && yourBrand !== aiBrand) ||
      (yourModel && aiModel && yourModel.toLowerCase() !== aiModel.toLowerCase()));

  useEffect(() => {
    if (externalResult) setExpanded(true);
  }, [externalResult]);

  const identify = async (opts?: { respectUserLock?: boolean }) => {
    if (!images.length) return;
    const colorwayOnly = opts?.respectUserLock ?? userLocked;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/market/shoe-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          images: images.map((i) => i.public_url),
          brandHint: formBrand.trim() || undefined,
          modelHint: formModel.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Identification failed');
      setLocalResult(data.result);
      setExpanded(true);
      if (!colorwayOnly && data.autoApplyRecommended !== false) {
        onAccept({
          brand: data.result.brand,
          model: data.result.model,
          colorway: data.result.colorway,
        });
      } else if (colorwayOnly) {
        onAccept(
          {
            brand: formBrand || data.result.brand,
            model: formModel || data.result.model,
            colorway: data.result.colorway,
          },
          { colorwayOnly: true }
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Identification failed');
    } finally {
      setLoading(false);
    }
  };

  if (!images.length) return null;

  const headerLabel = busy
    ? 'Identifying shoe from photos…'
    : userLocked
      ? identityMismatch
        ? 'You overrode AI — using your brand/model'
        : 'Using your brand/model'
      : result
        ? autoApplied
          ? 'Shoe identified — fields filled'
          : 'Shoe identified'
        : 'Identify this shoe';

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        userLocked && identityMismatch
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-border bg-card/50'
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (!result && !busy) void identify();
          else if (result) setExpanded((v) => !v);
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-accent transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          {headerLabel}
        </span>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        )}
      </button>
      {error ? <p className="px-4 pb-3 text-xs text-destructive">{error}</p> : null}
      {expanded && result ? (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {identityMismatch ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              AI guessed {result.brand} {result.model}. Your listing uses{' '}
              <span className="font-medium">
                {formBrand || '—'} {formModel || ''}
              </span>{' '}
              — your pick wins.
            </p>
          ) : null}
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
            <dt className="text-muted-foreground">AI brand</dt>
            <dd className={cn('font-medium', identityMismatch && 'line-through text-muted-foreground')}>
              {result.brand}
            </dd>
            <dt className="text-muted-foreground">AI model</dt>
            <dd className={cn('font-medium', identityMismatch && 'line-through text-muted-foreground')}>
              {result.model}
            </dd>
            {userLocked && formBrand ? (
              <>
                <dt className="text-muted-foreground">Your brand</dt>
                <dd className="text-foreground font-medium">{formBrand}</dd>
                <dt className="text-muted-foreground">Your model</dt>
                <dd className="text-foreground font-medium">{formModel || '—'}</dd>
              </>
            ) : null}
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
          {userLocked ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => void identify({ respectUserLock: true })}
              disabled={busy}
            >
              Re-run AI for colorway only
            </Button>
          ) : autoApplied ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => void identify()}
              disabled={busy}
            >
              Re-identify from photos
            </Button>
          ) : (
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
          )}
        </div>
      ) : null}
    </div>
  );
}
