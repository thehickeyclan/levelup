import { Suspense } from 'react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { fetchMarketBrowseListings } from '@/lib/market/browse-listings';
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

export default async function MarketPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  let listings: Awaited<ReturnType<typeof fetchMarketBrowseListings>> = [];
  let pendingOffers = 0;

  if (tenant) {
    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    listings = await fetchMarketBrowseListings(supabase, tenant.slug);

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
      <MarketBrowseClient initialListings={listings} pendingOffers={pendingOffers} />
    </Suspense>
  );
}
