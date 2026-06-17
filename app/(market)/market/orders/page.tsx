import { Suspense } from 'react';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { primaryListingImageUrl } from '@/lib/market/listing-images';
import { MarketOrdersClient, type MarketOrderRow } from './market-orders-client';

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

export default async function MarketOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const sp = await searchParams;
  const showSuccess = sp.success === 'true';

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return null;

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: rows }, pendingOffers] = await Promise.all([
    supabase
      .from('market_orders')
      .select(`
        id, order_ref, status, amount_cents, shipping_cents, seller_payout_cents, created_at,
        listing_id, buyer_id, seller_id, tracking_number,
        market_listings(title, brand, model, market_listing_images(public_url, display_order))
      `)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50),
    pendingOfferCount(tenant.slug, user.id),
  ]);

  const orders: MarketOrderRow[] = (rows ?? []).map((row) => {
    const listing = row.market_listings as {
      title?: string;
      brand?: string;
      model?: string;
      market_listing_images?: { public_url: string; display_order: number }[];
    } | null;
    const isBuyer = row.buyer_id === user.id;
    return {
      id: row.id as string,
      order_ref: row.order_ref as string,
      status: row.status as string,
      amount_cents: row.amount_cents as number,
      shipping_cents: (row.shipping_cents as number) ?? 0,
      seller_payout_cents: (row.seller_payout_cents as number) ?? 0,
      created_at: row.created_at as string,
      listing_id: row.listing_id as string,
      listing_title:
        listing?.title || [listing?.brand, listing?.model].filter(Boolean).join(' ') || 'Listing',
      listing_image_url: primaryListingImageUrl(listing?.market_listing_images ?? null),
      is_buyer: isBuyer,
      can_add_tracking: !isBuyer && row.status === 'paid',
      can_confirm_delivery: isBuyer && row.status === 'shipped',
    };
  });

  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground">Loading…</div>}>
      <MarketOrdersClient orders={orders} showSuccess={showSuccess} pendingOffers={pendingOffers} />
    </Suspense>
  );
}
