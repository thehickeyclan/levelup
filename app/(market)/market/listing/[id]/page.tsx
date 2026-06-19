'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Eye, Flame, Lock, Send, ShoppingCart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/back-link';
import { ListingSellerCard } from '@/components/market/listing-seller-card';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import { sanitizeBuyerListingDescription } from '@/lib/market/sanitize-listing-description';
import {
  listingHeroImageUrl,
  primaryImageUsesClean,
  type MarketListingImageRow,
} from '@/lib/market/listing-images';
import type { MarketSellerStats } from '@/lib/market/seller-reputation';
import { cn } from '@/lib/utils';

export default function ListingDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const offerSent =
    searchParams.get('offered') === 'true' || searchParams.get('offer') === 'sent';

  const [data, setData] = useState<{
    listing: Record<string, unknown>;
    seller: { id: string; displayName: string; school?: string | null };
    sellerStats: MarketSellerStats | null;
    pending_offer_count: number;
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
      <div className="px-4 py-8 max-w-4xl mx-auto bg-background min-h-screen">
        <BackLink fallbackHref="/market" label="Back" />
        <p className="mt-4 text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const l = data.listing;
  const images = (
    (l.market_listing_images as MarketListingImageRow[] | undefined) ?? []
  ).sort((a, b) => a.display_order - b.display_order);
  const activeImg = images[activeImage];
  const heroUsesClean =
    activeImage === 0 && primaryImageUsesClean(images) && Boolean(activeImg);
  const heroUrl = activeImg
    ? listingHeroImageUrl(activeImg, activeImage === 0)
    : null;
  const priceCents = l.price_cents as number | null;
  const shippingCents = (l.shipping_cents as number) ?? 0;
  const listingType = (l.listing_type as string) || 'sell';
  const isCollection = listingType === 'collection';
  const isVault = listingType === 'vault';
  const isActive = l.status === 'active';
  const openToTrade = Boolean(l.open_to_trade);
  const aiAssisted = Boolean(l.ai_assisted);
  const wearState = (l.wear_state as 'bnib' | 'new_no_box' | 'used') || 'used';
  const conditionLabel = listingConditionDisplay(wearState, l.condition as string);
  const viewsCount = (l.views_count as number) ?? 0;
  const offerCount = data.pending_offer_count ?? 0;

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
    (l.colorway as string)?.trim() || null,
    conditionLabel,
  ].filter(Boolean) as string[];

  const displayTitle = (l.model as string)?.trim() || (l.title as string);
  const isTradeOnly = listingType === 'trade';
  const showTradeOnlyCta = isActive && isTradeOnly;
  const showVaultOfferCtAs = isActive && !isTradeOnly && !isCollection && (isVault || priceCents == null);
  const showBuyCta = isActive && !isVault && !isTradeOnly && !isCollection && priceCents != null;

  const collectionBlock = (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <p className="text-muted-foreground text-sm mb-1">Not for sale</p>
      <p className="text-muted-foreground text-xs">
        Part of {data.seller.displayName}&apos;s collection —{' '}
        <Link href={`/market/seller/${data.seller.id}`} className="text-accent hover:underline">
          follow them for updates
        </Link>
      </p>
    </div>
  );

  const askingLabel =
    isVault || priceCents == null
      ? 'Offer basis'
      : 'Asking';

  const askingValue =
    priceCents != null ? `$${(priceCents / 100).toFixed(0)}` : 'Offers';

  const ctaBlock = (
    <>
      {showTradeOnlyCta ? (
        <div className="space-y-2">
          <Button
            asChild
            className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full text-base hover:bg-accent/90"
          >
            <Link href={`/market/listing/${id}/offer?trade=1`} className="flex items-center justify-center gap-2">
              <Send className="h-4 w-4" />
              Offer a trade
            </Link>
          </Button>
        </div>
      ) : null}
      {showVaultOfferCtAs ? (
        <div className="space-y-2">
          <Button
            asChild
            className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full text-base hover:bg-accent/90"
          >
            <Link href={`/market/listing/${id}/offer`} className="flex items-center justify-center gap-2">
              <Send className="h-4 w-4" />
              Make an offer
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full rounded-full border-border text-muted-foreground hover:text-foreground hover:border-border"
          >
            <Link href={`/market/listing/${id}/offer?trade=1`}>Offer a trade instead</Link>
          </Button>
        </div>
      ) : null}
      {showBuyCta ? (
        <div className="space-y-2">
          <Button
            asChild
            className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full text-base hover:bg-accent/90"
          >
            <Link href={`/market/listing/${id}/checkout`} className="flex items-center justify-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Buy now — ${(priceCents! / 100).toFixed(0)}
            </Link>
          </Button>
          {openToTrade ? (
            <Button
              asChild
              variant="outline"
              className="w-full rounded-full border-border text-muted-foreground hover:text-foreground hover:border-border"
            >
              <Link href={`/market/listing/${id}/offer?trade=1`}>Offer a trade instead</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="px-4 pt-6 max-w-4xl mx-auto">
        <BackLink fallbackHref="/market" label="Market" />

        {offerSent ? (
          <p className="mt-4 text-sm text-accent bg-accent/10 border border-accent/30 rounded-xl p-3">
            Offer sent — seller has been notified.
          </p>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 mt-4 md:mt-6">
          {/* Hero photo */}
          <div className="space-y-0 -mx-4 md:mx-0">
            <div className="relative w-full aspect-[4/5] md:aspect-square overflow-hidden md:rounded-2xl bg-muted">
              {heroUrl ? (
                <img
                  src={heroUrl}
                  alt=""
                  className="w-full h-full object-contain p-3 md:p-4"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  No photo
                </div>
              )}
            </div>
            {heroUsesClean ? (
              <p className="text-[10px] text-muted-foreground px-4 md:px-0">
                <Sparkles className="inline h-3 w-3 text-accent mr-0.5" />
                Background removed — see all photos below
              </p>
            ) : null}
            {images.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto px-4 py-3 md:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {images.map((img, i) => (
                  <button
                    key={img.public_url + i}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    className={cn(
                      'shrink-0 w-14 h-14 rounded-lg border overflow-hidden bg-card',
                      i === activeImage ? 'border-accent ring-1 ring-accent' : 'border-border opacity-80'
                    )}
                  >
                    <img src={img.public_url} alt="" className="w-full h-full object-contain p-0.5" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Info + CTAs */}
          <div className="space-y-4 md:space-y-5">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-accent mb-2">
                {l.brand as string}
              </p>
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-3xl font-medium tracking-tight text-foreground leading-tight">
                  {displayTitle}
                </h1>
                {viewsCount > 0 && !isCollection ? (
                  <span className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground pt-1">
                    <Eye className="h-3.5 w-3.5 text-accent" />
                    {viewsCount} watching
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {specChips.map((chip) => (
                <span
                  key={chip}
                  className="bg-card border border-border rounded-full px-3 py-1 text-xs text-muted-foreground"
                >
                  {chip}
                </span>
              ))}
            </div>

            {aiAssisted ? (
              <p className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-accent" />
                AI-assisted listing
              </p>
            ) : null}

            {offerCount > 0 && !isCollection ? (
              <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
                <span className="text-sm text-muted-foreground">Already interested</span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-accent">
                  <Flame className="h-4 w-4" />
                  {offerCount} offer{offerCount !== 1 ? 's' : ''} on this pair
                </span>
              </div>
            ) : null}

            {isVault && !isCollection ? (
              <div className="rounded-xl border border-border border-l-[3px] border-l-accent bg-card px-4 py-3 flex gap-3">
                <Lock className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">In the vault</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Owner isn&apos;t actively selling — but the right offer changes that.
                  </p>
                </div>
              </div>
            ) : null}

            {!isCollection ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-accent">{askingValue}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{askingLabel}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{viewsCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Watching</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{offerCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Offers</p>
                </div>
              </div>
            ) : null}

            {isCollection && isActive ? (
              <div className="hidden md:block">{collectionBlock}</div>
            ) : null}

            {!isVault && !isCollection && priceCents != null && shippingCents > 0 ? (
              <p className="text-sm text-muted-foreground">
                + ${(shippingCents / 100).toFixed(2)} shipping
              </p>
            ) : null}

            <div className="hidden md:block pt-1">
              {!isCollection ? ctaBlock : null}
            </div>

            <ListingSellerCard
              sellerId={data.seller.id}
              displayName={data.seller.displayName}
              school={data.seller.school}
              stats={stats}
            />

            {l.description ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Seller description
                </p>
                <p className="text-sm whitespace-pre-line text-foreground/80 leading-relaxed">
                  {sanitizeBuyerListingDescription(l.description as string)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {(showTradeOnlyCta || showVaultOfferCtAs || showBuyCta || (isCollection && isActive)) ? (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-30 px-4 pb-2 pt-3 bg-gradient-to-t from-background via-background/98 to-transparent">
          {isCollection && isActive ? (
            collectionBlock
          ) : showTradeOnlyCta ? (
            <Button asChild className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full">
              <Link href={`/market/listing/${id}/offer?trade=1`}>Offer a trade</Link>
            </Button>
          ) : showVaultOfferCtAs ? (
            <Button asChild className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full">
              <Link href={`/market/listing/${id}/offer`}>Make an offer</Link>
            </Button>
          ) : (
            <Button asChild className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full">
              <Link href={`/market/listing/${id}/checkout`}>
                Buy now — ${(priceCents! / 100).toFixed(0)}
              </Link>
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
