import { Suspense } from 'react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { fetchMarketBrowseListings } from '@/lib/market/browse-listings';
import { fetchMarketCollectorBrowseData } from '@/lib/market/collector-browse';
import { fetchMarketBrandCatalog } from '@/lib/market/market-brand-catalog';
import { TOC_MARKET_FOLLOW_GOAL } from '@/lib/toc-giveaway';
import { MarketBrowseClient } from './market-browse-client';

async function fetchPendingOfferCount(tenantSlug: string, userId: string): Promise<number> {
  const admin = createAdminClient(tenantSlug);
  const { data: myListings } = await admin
    .from('market_listings')
    .select('id')
    .eq('seller_id', userId);

  const listingIds = (myListings ?? []).map((l) => l.id as string);
  if (!listingIds.length) return 0;

  const { count } = await admin
    .from('market_offers')
    .select('id', { count: 'exact', head: true })
    .in('listing_id', listingIds)
    .eq('status', 'pending');

  return count ?? 0;
}

function parsePriceParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ minPrice?: string; maxPrice?: string }>;
}) {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  const sp = await searchParams;
  const minPrice = parsePriceParam(sp.minPrice);
  const maxPrice = parsePriceParam(sp.maxPrice);
  const browseFilters =
    minPrice != null || maxPrice != null ? { minPrice, maxPrice } : undefined;

  let listings: Awaited<ReturnType<typeof fetchMarketBrowseListings>> = [];
  let collectionListings: Awaited<ReturnType<typeof fetchMarketBrowseListings>> = [];
  let collectors: Awaited<ReturnType<typeof fetchMarketCollectorBrowseData>>['collectors'] = [];
  let browseBrands: string[] = [];
  let pendingOffers = 0;
  let browsePairCount = 0;
  let myCollectionCount = 0;
  let tocMarketFollowCount = 0;

  if (tenant) {
    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [fetchedListings, browseCountResult] = await Promise.all([
      fetchMarketBrowseListings(supabase, tenant.slug, {
        allTypes: true,
        limit: 150,
        ...browseFilters,
      }),
      supabase
        .from('market_listings')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_slug', tenant.slug)
        .eq('status', 'active'),
    ]);
    listings = fetchedListings;
    browsePairCount = browseCountResult.count ?? 0;

    try {
      const [collectorData, brandCatalog] = await Promise.all([
        fetchMarketCollectorBrowseData(supabase, tenant.slug),
        fetchMarketBrandCatalog(supabase, tenant.slug),
      ]);
      collectors = collectorData.collectors;
      collectionListings = collectorData.listings;
      browseBrands = brandCatalog.browseBrands;
    } catch {
      collectors = [];
      collectionListings = [];
    }

    if (user) {
      try {
        const admin = createAdminClient(tenant.slug);
        const [offers, collectionCountResult, tocFollowCountResult] = await Promise.all([
          fetchPendingOfferCount(tenant.slug, user.id),
          supabase
            .from('market_listings')
            .select('id', { count: 'exact', head: true })
            .eq('seller_id', user.id)
            .eq('status', 'active'),
          admin
            .from('market_listing_follows')
            .select('listing_id', { count: 'exact', head: true })
            .eq('follower_id', user.id),
        ]);
        pendingOffers = offers;
        myCollectionCount = collectionCountResult.count ?? 0;
        tocMarketFollowCount = tocFollowCountResult.count ?? 0;
      } catch {
        pendingOffers = 0;
        myCollectionCount = 0;
        tocMarketFollowCount = 0;
      }
    }
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen pb-24 px-4 pt-6 max-w-4xl mx-auto text-muted-foreground">
          Loading…
        </div>
      }
    >
      <MarketBrowseClient
        initialListings={listings}
        collectionListings={collectionListings}
        collectors={collectors}
        browseBrands={browseBrands}
        pendingOffers={pendingOffers}
        browsePairCount={browsePairCount}
        myCollectionCount={myCollectionCount}
        tocMarketFollowCount={tocMarketFollowCount}
        tocMarketFollowGoal={TOC_MARKET_FOLLOW_GOAL}
      />
    </Suspense>
  );
}
