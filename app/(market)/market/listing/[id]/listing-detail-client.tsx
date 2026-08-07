'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Eye, Flame, Send, Share2, ShoppingCart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListingSellerCard } from '@/components/market/listing-seller-card';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import { sanitizeBuyerListingDescription } from '@/lib/market/sanitize-listing-description';
import {
  listingHeroImageUrl,
  type MarketListingImageRow,
} from '@/lib/market/listing-images';
import { sellerCollectionFromLabel, resolveSellerDisplayName } from '@/lib/market/seller';
import { formatListingColorLabel } from '@/lib/market/color-family';
import { formatColorwayAlsoKnownAs } from '@/lib/market/shoe-id/colorway-profiles';
import { RarityBadge } from '@/components/market/rarity-badge';
import { ListingTypeQuickActions } from '@/components/market/listing-type-quick-actions';
import { normalizeMarketRarity, rarityShortHint } from '@/lib/market/rarity';
import { collectionAcceptsOffers, isCollectionListingType, sellAcceptsOffers } from '@/lib/market/accepts-offers';
import type { MarketListingType } from '@/lib/market/listing-type-options';
import type { MarketSellerStats } from '@/lib/market/seller-reputation';
import { SellerPurchaseNotesCard } from '@/components/market/collection-purchase-notes';
import { ListingSizePicker } from '@/components/market/listing-size-picker';
import {
  formatListingSizesLabel,
  formatMarketShoeSizeDual,
  supportsMultiSizeInventory,
  type ListingSizeRow,
} from '@/lib/market/listing-sizes';
import { cn } from '@/lib/utils';
import { copyTextToClipboard } from '@/lib/copy-to-clipboard';

import type { ShoeModelAbout } from '@/lib/market/shoe-model-content';
import type { ListingConditionRead } from '@/lib/market/listing-condition-read';

const ListingConditionReadSection = dynamic(
  () =>
    import('@/components/market/listing-condition-read-section').then((m) => ({
      default: m.ListingConditionReadSection,
    })),
  { ssr: false }
);

const ListingShoeAboutSections = dynamic(
  () =>
    import('@/components/market/listing-shoe-about-section').then((m) => ({
      default: m.ListingShoeAboutSections,
    })),
  { ssr: false }
);

const ListingQaSection = dynamic(
  () =>
    import('@/components/market/listing-qa-section').then((m) => ({
      default: m.ListingQaSection,
    })),
  { ssr: false }
);

type MarketListingShareInput = {
  id?: string;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: number | string | null;
  price_cents?: number | null;
  listing_type?: string | null;
  accepts_offers?: boolean | null;
};

function marketListingShareUrl(listingId: string, origin = 'https://www.wrestlingguild.com') {
  return `${origin.replace(/\/$/, '')}/market/listing/${listingId}`;
}

function marketListingShareTitle(listing: MarketListingShareInput) {
  const brand = listing.brand?.trim();
  const model = listing.model?.trim() || listing.title?.trim();
  return [brand, model].filter(Boolean).join(' ') || 'Guild Market listing';
}

function marketListingShareStatus(listing: MarketListingShareInput) {
  if (listing.price_cents != null) return `$${(listing.price_cents / 100).toFixed(0)}`;
  if (listing.listing_type === 'trade') return 'Open to trade';
  if (listing.listing_type === 'collection' || listing.listing_type === 'vault') {
    return listing.accepts_offers === false ? 'Guild Collection' : 'Guild Collection · offers welcome';
  }
  return 'Make an offer';
}

function marketListingShareMessage(
  listing: MarketListingShareInput & { id: string },
  origin = 'https://www.wrestlingguild.com'
) {
  const details = [listing.size ? `Size ${listing.size}` : null, marketListingShareStatus(listing)]
    .filter(Boolean)
    .join(' · ');
  return [
    marketListingShareTitle(listing),
    details,
    'See it on Guild Market:',
    marketListingShareUrl(listing.id, origin),
  ]
    .filter(Boolean)
    .join('\n');
}

export default function ListingDetailClient() {
  const params = useParams();
  const id = params.id as string;

  const [offerSent, setOfferSent] = useState(false);
  const [data, setData] = useState<{
    listing: Record<string, unknown>;
    seller: { id: string; displayName: string; school?: string | null };
    sellerStats: MarketSellerStats | null;
    pending_offer_count: number;
    following?: boolean;
    follower_count?: number;
    shoe_history_stale?: boolean;
    viewer?: {
      isSeller: boolean;
      can_change_mode?: boolean;
      mode_blocked_reason?: string | null;
      active_trade_id?: string | null;
    };
  } | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [selectedSizeUs, setSelectedSizeUs] = useState<number | null>(null);
  const [inventorySizes, setInventorySizes] = useState<ListingSizeRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shoeAbout, setShoeAbout] = useState<ShoeModelAbout | null>(null);
  const [conditionRead, setConditionRead] = useState<ListingConditionRead | null>(null);
  const [conditionAnalyzing, setConditionAnalyzing] = useState(false);
  const [colorwayAliases, setColorwayAliases] = useState<string[]>([]);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shared'>('idle');
  const staleHistoryRepairRef = useRef<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setOfferSent(q.get('offered') === 'true' || q.get('offer') === 'sent');
  }, []);

  useEffect(() => {
    setLoadError(null);
    void fetch(`/api/market/listings/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.listing) {
          throw new Error((d.error as string) || 'Listing not found');
        }
        return d;
      })
      .then((d) => {
        setData(d);
        setShoeAbout((d.shoe_about as ShoeModelAbout | null) ?? null);
        setColorwayAliases((d.colorway_aliases as string[] | undefined) ?? []);
        setConditionRead((d.condition_read as ListingConditionRead | null) ?? null);
        setFollowing(Boolean(d.following));
        setActiveImage(0);
        const sizes = (d.sizes as ListingSizeRow[] | undefined) ?? [];
        const listingWear = (d.listing.wear_state as string) || 'used';
        const multiSize = supportsMultiSizeInventory(listingWear);
        setInventorySizes(multiSize ? sizes : []);
        const firstAvailable = multiSize ? sizes.find((row) => row.quantity > 0) : undefined;
        setSelectedSizeUs(firstAvailable?.size_us ?? null);
      })
      .catch((err) => {
        setData(null);
        setLoadError(err instanceof Error ? err.message : 'Could not load listing');
      });
  }, [id]);

  useEffect(() => {
    if (!data?.listing) return;
    const l = data.listing;
    if (normalizeMarketRarity(l.rarity as string | null)) return;
    if (!String(l.brand ?? '').trim() || !String(l.model ?? '').trim()) return;

    void fetch('/api/market/ai/rarity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: id, persist: true }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.rarity) {
          setData((prev) =>
            prev ? { ...prev, listing: { ...prev.listing, rarity: d.rarity } } : prev
          );
        }
      })
      .catch(() => {});
  }, [id, data?.listing?.rarity, data?.listing?.brand, data?.listing?.model]);

  useEffect(() => {
    staleHistoryRepairRef.current = null;
  }, [id]);

  useEffect(() => {
    if (!data?.listing) return;
    const brand = String(data.listing.brand ?? '').trim();
    const model = String(data.listing.model ?? '').trim();
    if (!brand || model.length < 2) return;

    if (shoeAbout && !data.shoe_history_stale) return;

    if (data.shoe_history_stale) {
      if (staleHistoryRepairRef.current === id) return;
      staleHistoryRepairRef.current = id;
    } else if (shoeAbout) {
      return;
    }

    void fetch('/api/market/ai/shoe-about', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId: id,
        modelYear: (data.listing.model_year as number | null) ?? null,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.shoe_about) setShoeAbout(d.shoe_about as ShoeModelAbout);
      })
      .catch(() => {});
  }, [id, data?.listing, data?.shoe_history_stale, shoeAbout]);

  useEffect(() => {
    if (!data?.listing || conditionRead || conditionAnalyzing) return;
    if (!data.viewer?.isSeller) return;
    const wear = (data.listing.wear_state as string) || 'used';
    if (wear !== 'used') return;
    const imgs = (data.listing.market_listing_images as unknown[] | undefined) ?? [];
    if (!imgs.length) return;
    if (!String(data.listing.model ?? '').trim()) return;

    setConditionAnalyzing(true);
    void fetch('/api/market/ai/condition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: id, wear_state: 'used' }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.analysis) {
          setConditionRead({
            wrestle_score: Number(d.analysis.wrestle_score),
            grade: String(d.analysis.grade),
            breakdown: d.analysis.breakdown ?? {},
            summary: d.analysis.summary ?? null,
            listing_tip: d.analysis.listing_tip ?? null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setConditionAnalyzing(false));
  }, [id, data?.listing, data?.viewer?.isSeller, conditionRead, conditionAnalyzing]);

  const toggleFollow = async () => {
    if (!data || data.viewer?.isSeller) return;
    setFollowBusy(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      const res = await fetch(`/api/market/listings/${id}/follow`, {
        method: wasFollowing ? 'DELETE' : 'POST',
      });
      if (!res.ok) {
        setFollowing(wasFollowing);
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              following: !wasFollowing,
              follower_count: Math.max(
                0,
                (prev.follower_count ?? 0) + (wasFollowing ? -1 : 1)
              ),
            }
          : prev
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setFollowBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="px-4 py-8 max-w-4xl mx-auto bg-background min-h-screen space-y-4">
        <Link
          href="/market/my-listings"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          My Market
        </Link>
        <p className="text-destructive">{loadError}</p>
        <Button asChild variant="outline">
          <Link href="/market/my-listings">Back to My Market</Link>
        </Button>
      </div>
    );
  }

  if (!data?.listing) {
    return (
      <div className="px-4 py-8 max-w-4xl mx-auto bg-background min-h-screen">
        <Link
          href="/market"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back
        </Link>
        <p className="mt-4 text-muted-foreground">Loading listing…</p>
      </div>
    );
  }

  const l = data.listing;
  const images = (
    (l.market_listing_images as MarketListingImageRow[] | undefined) ?? []
  ).sort((a, b) => a.display_order - b.display_order);
  const activeImg = images[activeImage];
  const heroUrl = activeImg
    ? listingHeroImageUrl(activeImg, activeImage === 0)
    : null;
  const priceCents = l.price_cents as number | null;
  const shippingCents = (l.shipping_cents as number) ?? 0;
  const rawListingType = (l.listing_type as string) || 'sell';
  const listingType = (
    rawListingType === 'vault' ? 'collection' : rawListingType
  ) as MarketListingType;
  const isCollection = isCollectionListingType(rawListingType);
  const isActive = l.status === 'active';
  const openToTrade = Boolean(l.open_to_trade);
  const sellOffersOpen = sellAcceptsOffers({
    listing_type: listingType,
    price_cents: priceCents,
    accepts_offers: l.accepts_offers as boolean | null,
  });
  const collectionOffersOpen =
    isCollection &&
    collectionAcceptsOffers({
      listing_type: rawListingType,
      accepts_offers: l.accepts_offers as boolean | null,
    });
  const wearState = (l.wear_state as 'bnib' | 'new_no_box' | 'used') || 'used';
  const conditionLabel = listingConditionDisplay(wearState, l.condition as string);
  const viewsCount = (l.views_count as number) ?? 0;
  const offerCount = data.pending_offer_count ?? 0;
  const followerCount = data.follower_count ?? 0;
  const isSeller = Boolean(data.viewer?.isSeller);
  const canEdit =
    isSeller &&
    (l.status === 'active' || l.status === 'draft' || l.status === 'archived');

  const stats: MarketSellerStats = data.sellerStats ?? {
    salesCount: 0,
    reviewCount: 0,
    averageRating: null,
    positivePercent: null,
    memberSince: null,
  };

  const sellerId = String(data.seller?.id ?? l.seller_id ?? '');
  const sellerDisplayName = resolveSellerDisplayName(
    data.seller
      ? {
          id: sellerId,
          displayName: data.seller.displayName,
          role: 'unknown',
          school: data.seller.school ?? null,
        }
      : null,
    sellerId
  );
  const sellerSchool = data.seller?.school ?? null;

  const colorLabel = formatListingColorLabel(
    l.color_family as string | null,
    l.colorway as string | null
  );
  const colorwayAlsoKnownAs = formatColorwayAlsoKnownAs(colorwayAliases);
  const sizeLabel = (() => {
    if (supportsMultiSizeInventory(wearState)) {
      if (inventorySizes.length > 0) return formatListingSizesLabel(inventorySizes);
      return null;
    }
    return l.size != null ? formatMarketShoeSizeDual(Number(l.size)) : null;
  })();
  const specChips = [
    l.model_year ? String(l.model_year) : null,
    sizeLabel,
    colorLabel,
    conditionLabel,
  ].filter(Boolean) as string[];

  const displayTitle = (l.model as string)?.trim() || (l.title as string);
  const listingRarity = normalizeMarketRarity(l.rarity as string | null);
  const isTradeOnly = listingType === 'trade';
  const showTradeOnlyCta = isActive && isTradeOnly && !isSeller;
  const showCollectionOfferCta = isActive && !isSeller && collectionOffersOpen;
  const showMakeOfferCta =
    isActive &&
    !isSeller &&
    !collectionOffersOpen &&
    !isTradeOnly &&
    !isCollection &&
    priceCents == null;
  const showSellMakeOfferCta =
    isActive &&
    !isSeller &&
    listingType === 'sell' &&
    !isCollection &&
    priceCents != null &&
    sellOffersOpen;
  const showBuyCta =
    isActive &&
    !isSeller &&
    !collectionOffersOpen &&
    !isTradeOnly &&
    !isCollection &&
    priceCents != null;

  const collectionShowcaseBlock = (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <p className="text-muted-foreground text-sm mb-1">Not for sale</p>
      <p className="text-muted-foreground text-xs">
        Add to your watch list — get notified when it goes on sale, gets a first offer, drops in price, or sells.
      </p>
    </div>
  );

  const collectionOfferBlock = (
    <div className="space-y-2">
      <div className="rounded-xl border border-border border-l-4 border-l-accent bg-card px-4 py-3">
        <p className="text-accent text-xs font-medium mb-0.5">In a collection — offers welcome</p>
        <p className="text-muted-foreground text-xs">
          Not listed for sale, but the right offer might change that.
        </p>
      </div>
      <Button
        asChild
        className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full text-base hover:bg-accent/90"
      >
        <Link href={`/market/listing/${id}/offer`} className="flex items-center justify-center gap-2">
          <Send className="h-4 w-4" />
          Make an offer
        </Link>
      </Button>
    </div>
  );

  const askingLabel = 'Asking';

  const askingValue = priceCents != null ? `$${(priceCents / 100).toFixed(0)}` : null;

  async function shareListing() {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://www.wrestlingguild.com';
    const url = marketListingShareUrl(id, origin);
    const title = marketListingShareTitle({
      title: l.title as string | undefined,
      brand: l.brand as string | null,
      model: l.model as string | null,
    });
    const text = marketListingShareMessage(
      {
        id,
        title: l.title as string | undefined,
        brand: l.brand as string | null,
        model: l.model as string | null,
        size: sizeLabel,
        price_cents: priceCents,
        listing_type: listingType,
        accepts_offers: l.accepts_offers as boolean | null,
      },
      origin
    );

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text, url });
        setShareStatus('shared');
      } else {
        const copied = await copyTextToClipboard(text);
        setShareStatus(copied ? 'copied' : 'idle');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const copied = await copyTextToClipboard(text);
      setShareStatus(copied ? 'copied' : 'idle');
    } finally {
      window.setTimeout(() => setShareStatus('idle'), 2200);
    }
  }

  const checkoutHref =
    inventorySizes.length > 0 && selectedSizeUs != null
      ? `/market/listing/${id}/checkout?size=${selectedSizeUs}`
      : `/market/listing/${id}/checkout`;

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
      {showMakeOfferCta ? (
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
        </div>
      ) : null}
      {showBuyCta ? (
        <div className="space-y-3">
          {inventorySizes.length > 0 && supportsMultiSizeInventory(wearState) ? (
            <ListingSizePicker
              sizes={inventorySizes}
              value={selectedSizeUs}
              onChange={setSelectedSizeUs}
            />
          ) : null}
          {inventorySizes.length > 0 &&
          supportsMultiSizeInventory(wearState) &&
          selectedSizeUs == null ? (
            <Button
              disabled
              className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full text-base opacity-50"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Select a size to buy
            </Button>
          ) : (
            <Button
              asChild
              className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full text-base hover:bg-accent/90"
            >
              <Link href={checkoutHref} className="flex items-center justify-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Buy now — ${(priceCents! / 100).toFixed(0)}
                {selectedSizeUs != null &&
                inventorySizes.length > 0 &&
                supportsMultiSizeInventory(wearState)
                  ? ` · ${formatMarketShoeSizeDual(selectedSizeUs)}`
                  : ''}
              </Link>
            </Button>
          )}
          {showSellMakeOfferCta ? (
            <Button
              asChild
              variant="outline"
              className="w-full rounded-full border-border text-muted-foreground hover:text-foreground hover:border-border"
            >
              <Link href={`/market/listing/${id}/offer`}>Make an offer</Link>
            </Button>
          ) : null}
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
    <div className="min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom,0px))] md:pb-24 bg-background">
      <div className="px-4 pt-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/market"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Market
          </Link>
          {canEdit ? (
            <Link
              href={`/market/listing/${id}/edit`}
              replace
              className="text-sm font-medium text-accent hover:text-accent/80 shrink-0"
            >
              Edit listing
            </Link>
          ) : null}
        </div>

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
              {listingRarity ? (
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <RarityBadge rarity={listingRarity} size="md" />
                  <span className="text-xs text-muted-foreground">{rarityShortHint(listingRarity)}</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-2">Assessing this pair’s collector profile…</p>
              )}
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground leading-tight">
                  {displayTitle}
                </h1>
                <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={() => void shareListing()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 min-h-[40px] text-xs font-medium text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors touch-manipulation"
                    aria-label="Share this listing"
                  >
                    <Share2 className="h-4 w-4 shrink-0" />
                    {shareStatus === 'copied' ? 'Copied' : shareStatus === 'shared' ? 'Shared' : 'Share'}
                  </button>
                  {!isSeller ? (
                    <button
                      type="button"
                      disabled={followBusy}
                      onClick={() => void toggleFollow()}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 min-h-[40px] text-xs font-medium transition-colors touch-manipulation',
                        following
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-accent'
                      )}
                      aria-label={following ? 'Remove from watch list' : 'Add to watch list'}
                      title={
                        following
                          ? 'On your watch list — tap to remove'
                          : 'Add to watch list for price and status updates'
                      }
                    >
                      <Eye
                        className={cn('h-4 w-4 shrink-0', following && 'text-accent')}
                        strokeWidth={following ? 2.25 : 1.75}
                      />
                      {following ? 'Watching' : 'Watch'}
                    </button>
                  ) : null}
                  {followerCount > 0 ? (
                    <span className="text-[10px] text-muted-foreground">
                      {followerCount} watching
                    </span>
                  ) : null}
                  {viewsCount > 0 && !isCollection ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="h-3.5 w-3.5 text-accent" />
                      {viewsCount} views
                    </span>
                  ) : null}
                </div>
              </div>
              {isCollection ? (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {sellerCollectionFromLabel(sellerDisplayName)}
                </p>
              ) : null}
              {isCollection ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Collection — {collectionOffersOpen ? 'offers welcome' : 'not for sale'}
                </p>
              ) : null}
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

            {colorwayAlsoKnownAs ? (
              <p className="text-xs text-muted-foreground">{colorwayAlsoKnownAs}</p>
            ) : null}

            {wearState === 'used' && isSeller && conditionAnalyzing && !conditionRead ? (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-accent animate-pulse" />
                AI assessing condition from photos…
              </p>
            ) : null}

            {offerCount > 0 && (!isCollection || collectionOffersOpen) ? (
              <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
                <span className="text-sm text-muted-foreground">Already interested</span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-accent">
                  <Flame className="h-4 w-4" />
                  {offerCount} offer{offerCount !== 1 ? 's' : ''} on this pair
                </span>
              </div>
            ) : null}

            {collectionOffersOpen ? (
              <div className="rounded-xl border border-border border-l-4 border-l-accent bg-card px-4 py-3">
                <p className="text-accent text-xs font-medium mb-0.5">In a collection — offers welcome</p>
                <p className="text-muted-foreground text-xs">
                  Not listed for sale, but the right offer might change that.
                </p>
              </div>
            ) : null}

            {!isCollection && priceCents != null ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-accent">{askingValue}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{askingLabel}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{viewsCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Views</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{offerCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Offers</p>
                </div>
              </div>
            ) : null}

            {isCollection && collectionOffersOpen ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{offerCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Offers</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{followerCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Watching</p>
                </div>
              </div>
            ) : null}

            {isSeller && canEdit ? (
              <div className="rounded-xl border border-border bg-card p-3">
                <ListingTypeQuickActions
                  listingId={id}
                  currentType={listingType}
                  currentPriceCents={priceCents}
                  compact
                  modeBlockedReason={
                    data.viewer?.can_change_mode === false
                      ? data.viewer.mode_blocked_reason
                      : null
                  }
                  activeTradeId={data.viewer?.active_trade_id ?? null}
                  onUpdated={(patch) => {
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            listing: {
                              ...prev.listing,
                              listing_type: patch.listing_type,
                              price_cents: patch.price_cents,
                              ...(patch.shipping_cents != null
                                ? { shipping_cents: patch.shipping_cents }
                                : {}),
                            },
                            viewer: {
                              ...prev.viewer,
                              isSeller: prev.viewer?.isSeller ?? true,
                              can_change_mode: true,
                              mode_blocked_reason: null,
                              active_trade_id: null,
                            },
                          }
                        : prev
                    );
                  }}
                />
              </div>
            ) : null}

            {isSeller ? <SellerPurchaseNotesCard listing={l} /> : null}

            {isCollection && isActive && !isSeller ? (
              <div className="hidden md:block">
                {collectionOffersOpen ? collectionOfferBlock : collectionShowcaseBlock}
              </div>
            ) : null}

            {!isCollection && priceCents != null && shippingCents > 0 ? (
              <p className="text-sm text-muted-foreground">
                + ${(shippingCents / 100).toFixed(2)} shipping
              </p>
            ) : null}

            <div className="hidden md:block pt-1">{!isCollection ? ctaBlock : null}</div>

            <div className="border-t border-accent/20 pt-6 space-y-4">
              <h2 className="text-[10px] font-medium uppercase tracking-[0.15em] text-accent">
                This pair
              </h2>

              {wearState === 'used' && conditionRead ? (
                <ListingConditionReadSection read={conditionRead} sellerView={isSeller} />
              ) : null}

              {l.description ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Description
                  </p>
                  <p className="text-sm whitespace-pre-line text-foreground/80 leading-relaxed">
                    {sanitizeBuyerListingDescription(l.description as string, displayTitle)}
                  </p>
                </div>
              ) : null}

              {l.collector_notes ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Collector notes
                  </p>
                  <p className="text-sm whitespace-pre-line text-foreground/80 leading-relaxed">
                    {String(l.collector_notes)}
                  </p>
                </div>
              ) : null}
            </div>

            <ListingSellerCard
              sellerId={sellerId}
              displayName={sellerDisplayName}
              school={sellerSchool}
              stats={stats}
            />

            {shoeAbout ? <ListingShoeAboutSections about={shoeAbout} /> : null}

            {sellerId ? (
              <ListingQaSection
                listingId={id}
                sellerId={sellerId}
                currentUserId={(data.viewer as { id?: string } | undefined)?.id ?? null}
              />
            ) : null}
          </div>
        </div>
      </div>

      {(showTradeOnlyCta ||
        showCollectionOfferCta ||
        showMakeOfferCta ||
        showSellMakeOfferCta ||
        showBuyCta ||
        (isCollection && isActive && !isSeller && !collectionOffersOpen)) ? (
        <div className="md:hidden fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 px-4 pb-2 pt-3 bg-gradient-to-t from-background via-background/98 to-transparent">
          {isCollection && isActive && !collectionOffersOpen ? (
            collectionShowcaseBlock
          ) : showCollectionOfferCta ? (
            <Button asChild className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full">
              <Link href={`/market/listing/${id}/offer`}>Make an offer</Link>
            </Button>
          ) : showTradeOnlyCta ? (
            <Button asChild className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full">
              <Link href={`/market/listing/${id}/offer?trade=1`}>Offer a trade</Link>
            </Button>
          ) : showMakeOfferCta ? (
            <Button asChild className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full">
              <Link href={`/market/listing/${id}/offer`}>Make an offer</Link>
            </Button>
          ) : showBuyCta ? (
            <div className="space-y-2">
              <Button asChild className="w-full min-h-[52px] bg-accent text-accent-foreground font-semibold rounded-full">
                <Link href={checkoutHref}>
                  Buy now — ${(priceCents! / 100).toFixed(0)}
                </Link>
              </Button>
              {showSellMakeOfferCta ? (
                <Button
                  asChild
                  variant="outline"
                  className="w-full min-h-[44px] rounded-full border-border text-muted-foreground"
                >
                  <Link href={`/market/listing/${id}/offer`}>Make an offer</Link>
                </Button>
              ) : null}
              {openToTrade ? (
                <Button
                  asChild
                  variant="outline"
                  className="w-full min-h-[44px] rounded-full border-border text-muted-foreground"
                >
                  <Link href={`/market/listing/${id}/offer?trade=1`}>Offer a trade</Link>
                </Button>
              ) : null}
            </div>
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
