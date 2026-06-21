import { Suspense } from 'react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { fetchMarketBrowseListings } from '@/lib/market/browse-listings';
import { fetchMarketCollectorBrowseData } from '@/lib/market/collector-browse';
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
  let pendingOffers = 0;

  if (tenant) {
    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    listings = await fetchMarketBrowseListings(supabase, tenant.slug, browseFilters);

    try {
      const collectorData = await fetchMarketCollectorBrowseData(supabase, tenant.slug);
      collectors = collectorData.collectors;
      collectionListings = collectorData.listings;
    } catch {
      collectors = [];
      collectionListings = [];
    }

    if (user) {
      try {
        pendingOffers = await fetchPendingOfferCount(tenant.slug, user.id);
      } catch {
        pendingOffers = 0;
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
        pendingOffers={pendingOffers}
      />
    </Suspense>
  );
}
