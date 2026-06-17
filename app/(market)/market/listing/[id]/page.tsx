'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/back-link';
import { MarketSellerTrustBadge } from '@/components/market/seller-trust-badge';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import type { MarketSellerStats } from '@/lib/market/seller-reputation';

export default function ListingDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<{
    listing: Record<string, unknown>;
    seller: { id: string; displayName: string };
    sellerStats: MarketSellerStats | null;
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
  const priceCents = l.price_cents as number | null;
  const shippingCents = (l.shipping_cents as number) ?? 0;
  const stats = data.sellerStats ?? {
    salesCount: 0,
    reviewCount: 0,
    averageRating: null,
    positivePercent: null,
    memberSince: null,
  };

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

      <MarketSellerTrustBadge
        sellerId={data.seller.id}
        displayName={data.seller.displayName}
        stats={stats}
      />

      {l.description ? (
        <p className="text-sm whitespace-pre-line">{l.description as string}</p>
      ) : null}

      {l.status === 'active' && priceCents != null ? (
        <Button asChild className="w-full min-h-[48px] bg-accent text-black font-semibold">
          <Link href={`/market/checkout?listingId=${id}`}>Place market order</Link>
        </Button>
      ) : null}
    </div>
  );
}
