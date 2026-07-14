import { Suspense } from 'react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { fetchSellerOffers } from '@/lib/market/seller-offers-data';
import { getUnreadCount } from '@/lib/guild-messaging';
import { OffersInboxClient } from './offers-inbox-client';

async function pendingOfferCount(tenantSlug: string, userId: string): Promise<number> {
  const admin = createAdminClient(tenantSlug);
  const { data: listings } = await admin.from('market_listings').select('id').eq('seller_id', userId);
  const ids = (listings ?? []).map((l) => l.id as string);
  if (!ids.length) return 0;
  const { count } = await admin
    .from('market_offers')
    .select('id', { count: 'exact', head: true })
    .in('listing_id', ids)
    .eq('status', 'pending');
  return count ?? 0;
}

export default async function MarketOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const sp = await searchParams;
  const filterListingId = sp.listing?.trim() || null;

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return null;

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient(tenant.slug);
  const [groups, pendingOffers, messageUnread] = await Promise.all([
    // Admin client avoids RLS/embed surprises; still scoped to this seller in fetchSellerOffers.
    fetchSellerOffers(admin, user.id, filterListingId ?? undefined),
    pendingOfferCount(tenant.slug, user.id),
    getUnreadCount(admin, user.id),
  ]);

  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground">Loading…</div>}>
      <OffersInboxClient
        groups={groups}
        filterListingId={filterListingId}
        pendingOffers={pendingOffers}
        currentUserId={user.id}
        messageUnread={messageUnread}
      />
    </Suspense>
  );
}
