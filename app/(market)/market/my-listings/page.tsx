import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { fetchMyListings } from '@/lib/market/my-listings-data';
import { MyListingsClient } from './my-listings-client';

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

export default async function MyListingsPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return null;

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [groups, pendingOffers] = await Promise.all([
    fetchMyListings(supabase, user.id),
    pendingOfferCount(tenant.slug, user.id),
  ]);

  return <MyListingsClient groups={groups} pendingOffers={pendingOffers} />;
}
