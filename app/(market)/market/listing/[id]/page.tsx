'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/back-link';
import { AI_DISCLAIMER } from '@/lib/market/ai/prompts';
import { cosmeticAppearanceLabel } from '@/lib/market/condition-grade';
import { listingConditionDisplay } from '@/lib/market/wear-state';

export default function ListingDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<{
    listing: Record<string, unknown>;
    seller: { displayName: string };
  } | null>(null);

  useEffect(() => {
    fetch(`/api/market/listings/${id}`)
      .then((r) => r.json())
      .then(setData);
  }, [id]);

  if (!data?.listing) {
    return (
      <div className="px-4 py-8">
        <BackLink fallbackHref="/market" label="Back" />
        <p className="mt-4 text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const l = data.listing;
  const images = (l.market_listing_images as { public_url: string; display_order: number }[] | undefined) ?? [];
  const primary = images.sort((a, b) => a.display_order - b.display_order)[0]?.public_url;
  const ai = l.market_ai_analysis as Record<string, unknown> | null;
  const priceCents = l.price_cents as number | null;
  const shippingCents = (l.shipping_cents as number) ?? 0;

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market" label="Back to Market" />

      <div className="bg-white rounded-xl overflow-hidden aspect-square">
        {primary ? (
          <img src={primary} alt="" className="w-full h-full object-contain p-4" />
        ) : null}
      </div>

      <div>
        <h1 className="text-2xl font-bold">{l.title as string}</h1>
        <p className="text-muted-foreground">{data.seller.displayName}</p>
        <p className="text-sm text-zinc-400 mt-1">
          {l.brand as string} · {l.model as string}
          {l.model_year ? ` · ${l.model_year as number}` : ''}
          {' · '}Size {l.size as number} · {listingConditionDisplay(
            (l.wear_state as 'bnib' | 'new_no_box' | 'used') || 'used',
            l.condition as string
          )}
        </p>
      </div>

      {priceCents != null ? (
        <div className="text-2xl font-bold text-accent">
          ${(priceCents / 100).toFixed(2)}
          {shippingCents > 0 ? <span className="text-sm font-normal text-muted-foreground"> + ${(shippingCents / 100).toFixed(2)} shipping</span> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Vault — offers only</p>
      )}

      {ai?.condition_summary ? (
        <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
          <p className="text-sm font-medium">AI condition notes</p>
          {ai.condition_score != null ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-zinc-900/80 border border-zinc-800 p-2">
                <p className="text-xs text-accent font-medium">Wrestle-ready</p>
                <p className="font-semibold">{String(ai.condition_score)}/10</p>
                {ai.condition_grade_suggested ? (
                  <p className="text-xs text-muted-foreground capitalize">{String(ai.condition_grade_suggested).replace('_', ' ')}</p>
                ) : null}
              </div>
              {ai.cosmetic_score != null ? (
                <div className="rounded-md bg-zinc-900/80 border border-zinc-800 p-2">
                  <p className="text-xs text-zinc-400 font-medium">Appearance</p>
                  <p className="font-semibold">{String(ai.cosmetic_score)}/10</p>
                  <p className="text-xs text-muted-foreground">{cosmeticAppearanceLabel(Number(ai.cosmetic_score))}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">{ai.condition_summary as string}</p>
          {ai.cosmetic_summary ? (
            <p className="text-xs text-zinc-500">Appearance: {ai.cosmetic_summary as string}</p>
          ) : null}
        </div>
      ) : null}

      {l.description ? <p className="text-sm">{l.description as string}</p> : null}

      {l.status === 'active' && priceCents != null ? (
        <Button asChild className="w-full min-h-[48px] bg-accent text-black font-semibold">
          <Link href={`/market/checkout?listingId=${id}`}>Place market order</Link>
        </Button>
      ) : null}

      <p className="text-xs text-zinc-500">{AI_DISCLAIMER}</p>
    </div>
  );
}
