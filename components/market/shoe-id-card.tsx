'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';
import { cn } from '@/lib/utils';

export function ShoeIdCard({
  listingId,
  images,
  onAccept,
}: {
  listingId: string;
  images: { public_url: string }[];
  onAccept: (brand: string, model: string) => void;
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
    <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a]/50 overflow-hidden">
      <button
        type="button"
        onClick={() => {
          if (!result) void identify();
          else setExpanded((v) => !v);
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#888] hover:text-[#C9A265] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#C9A265]" />
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
        <div className="px-4 pb-4 space-y-3 border-t border-[#222] pt-3">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-[#666]">Brand</dt>
            <dd className="text-white font-medium">{result.brand}</dd>
            <dt className="text-[#666]">Model</dt>
            <dd className="text-white font-medium">{result.model}</dd>
            <dt className="text-[#666]">Era</dt>
            <dd className="text-[#888]">{result.era}</dd>
            <dt className="text-[#666]">Rarity</dt>
            <dd className="text-[#888] capitalize">{result.rarity}</dd>
            <dt className="text-[#666]">Est. value</dt>
            <dd className="text-[#C9A265]">
              ${Math.round(result.value_low_cents / 100)}–$
              {Math.round(result.value_high_cents / 100)}
            </dd>
            <dt className="text-[#666]">Confidence</dt>
            <dd className="text-[#888]">{Math.round(result.confidence * 100)}%</dd>
          </dl>
          <Button
            type="button"
            size="sm"
            className="w-full bg-[#C9A265] text-black"
            onClick={() => onAccept(result.brand, result.model)}
          >
            Use this identification
          </Button>
        </div>
      ) : null}
    </div>
  );
}
