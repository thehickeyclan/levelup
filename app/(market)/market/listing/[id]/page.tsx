'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Lock, Send, ShoppingCart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/back-link';
import { ListingSellerCard } from '@/components/market/listing-seller-card';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import type { MarketSellerStats } from '@/lib/market/seller-reputation';
import { cn } from '@/lib/utils';

export default function ListingDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const offerSent = searchParams.get('offer') === 'sent';

  const [data, setData] = useState<{
    listing: Record<string, unknown>;
    seller: { id: string; displayName: string; school?: string | null };
    sellerStats: MarketSellerStats | null;
  } | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    fetch(`/api/market/listings/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setActiveImage(0);
      });
  }, [id]);

  if (!data?.listing) {
    return (
      <div className="px-4 py-8 max-w-4xl mx-auto">
        <BackLink fallbackHref="/market" label="Back" />
        <p className="mt-4 text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const l = data.listing;
  const images = (
    (l.market_listing_images as { public_url: string; display_order: number }[] | undefined) ?? []
  ).sort((a, b) => a.display_order - b.display_order);
  const priceCents = l.price_cents as number | null;
  const shippingCents = (l.shipping_cents as number) ?? 0;
  const listingType = (l.listing_type as string) || 'sell';
  const isVault = listingType === 'vault';
  const isActive = l.status === 'active';
  const openToTrade = Boolean(l.open_to_trade);
  const aiAssisted = Boolean(l.ai_assisted);
  const wearState = (l.wear_state as 'bnib' | 'new_no_box' | 'used') || 'used';
  const conditionLabel = listingConditionDisplay(wearState, l.condition as string);

  const stats: MarketSellerStats = data.sellerStats ?? {
    salesCount: 0,
    reviewCount: 0,
    averageRating: null,
    positivePercent: null,
    memberSince: null,
  };

  const specChips = [
    l.model_year ? String(l.model_year) : null,
    l.size != null ? `Size ${l.size}` : null,
    conditionLabel,
  ].filter(Boolean) as string[];

  const displayTitle = (l.model as string)?.trim() || (l.title as string);

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 pt-6 max-w-4xl mx-auto">
        <BackLink fallbackHref="/market" label="Back to Market" />

        {offerSent ? (
          <p className="mt-4 text-sm text-green-600 bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            Offer sent — the seller will be notified.
          </p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 mt-4 md:mt-6">
          {/* Photos */}
          <div className="space-y-3">
            <div className="bg-white rounded-xl overflow-hidden aspect-square">
              {images[activeImage]?.public_url ? (
                <img
                  src={images[activeImage].public_url}
                  alt=""
                  className="w-full h-full object-contain p-4"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">
                  No photo
                </div>
              )}
            </div>
            {images.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={img.public_url + i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={cn(
                      'shrink-0 w-16 h-16 rounded-lg border overflow-hidden bg-white',
                      i === activeImage ? 'border-accent ring-1 ring-accent' : 'border-zinc-800'
                    )}
                  >
                    <img src={img.public_url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Info + CTAs */}
          <div className="space-y-4 md:space-y-5">
            <div>
              <span className="inline-block text-xs font-medium border border-accent/50 text-accent rounded-full px-3 py-1 mb-3">
                {l.brand as string}
              </span>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight">{displayTitle}</h1>
              {l.title && l.model && (l.title as string) !== displayTitle ? (
                <p className="text-sm text-muted-foreground mt-1">{l.title as string}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {specChips.map((chip) => (
                <span
                  key={chip}
                  className="bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1 text-xs text-zinc-400"
                >
                  {chip}
                </span>
              ))}
            </div>

            {aiAssisted ? (
              <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500 border border-zinc-800 rounded-full px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                AI-assisted listing
              </p>
            ) : null}

            {isVault ? (
              <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 flex gap-3">
                <Lock className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">In the vault</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Not actively for sale — owner will consider offers.
                  </p>
                </div>
              </div>
            ) : priceCents != null ? (
              <div>
                <p className="text-3xl font-bold text-accent">
                  ${(priceCents / 100).toFixed(0)}
                  {shippingCents > 0 ? (
                    <span className="text-base font-normal text-muted-foreground">
                      {' '}+ ${(shippingCents / 100).toFixed(2)} shipping
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}

            {isActive && isVault ? (
              <div className="space-y-2 pt-1">
                <Button
                  asChild
                  className="w-full min-h-[48px] bg-accent text-black font-semibold rounded-full"
                >
                  <Link href={`/market/listing/${id}/offer`} className="flex items-center justify-center gap-2">
                    <Send className="h-4 w-4" />
                    Make an offer
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="w-full rounded-full border-zinc-700 text-zinc-400"
                >
                  <Link href={`/market/listing/${id}/offer?trade=1`}>Offer a trade</Link>
                </Button>
              </div>
            ) : null}

            {isActive && !isVault && priceCents != null ? (
              <div className="space-y-2 pt-1">
                <Button
                  asChild
                  className="w-full min-h-[48px] bg-accent text-black font-semibold rounded-full"
                >
                  <Link href={`/market/checkout?listingId=${id}`} className="flex items-center justify-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Buy now — ${(priceCents / 100).toFixed(0)}
                  </Link>
                </Button>
                {openToTrade ? (
                  <Button asChild variant="outline" className="w-full rounded-full border-zinc-700 text-zinc-400">
                    <Link href={`/market/listing/${id}/offer?trade=1`}>Offer a trade</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}

            <ListingSellerCard
              sellerId={data.seller.id}
              displayName={data.seller.displayName}
              school={data.seller.school}
              stats={stats}
            />

            {l.description ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                  Seller description
                </p>
                <p className="text-sm whitespace-pre-line text-zinc-300">{l.description as string}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
