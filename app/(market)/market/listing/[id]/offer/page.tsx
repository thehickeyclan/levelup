import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import { primaryListingImageUrl } from '@/lib/market/listing-images';
import { OfferFormClient, type OfferListingSummary } from './offer-form-client';

type ListingRow = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  wear_state: string | null;
  model_year: number | null;
  status: string;
  seller_id: string;
  market_listing_images: {
    public_url: string;
    clean_public_url?: string | null;
    use_clean?: boolean;
    display_order: number;
  }[];
};

function toSummary(row: ListingRow): OfferListingSummary {
  const wearState = (row.wear_state as 'bnib' | 'new_no_box' | 'used' | null) || 'used';
  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    model: row.model,
    size: row.size,
    modelYear: row.model_year,
    conditionLabel: listingConditionDisplay(wearState, row.condition),
    imageUrl: primaryListingImageUrl(row.market_listing_images),
  };
}

export default async function ListingOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trade?: string }>;
}) {
  const { id: listingId } = await params;
  const sp = await searchParams;
  const defaultTrade = sp.trade === '1';

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/market/listing/${listingId}/offer`);

  const { data: listing } = await supabase
    .from('market_listings')
    .select(`
      id, title, brand, model, size, condition, wear_state, model_year, status, seller_id, listing_type,
      market_listing_images(public_url, clean_public_url, use_clean, display_order)
    `)
    .eq('id', listingId)
    .maybeSingle();

  if (
    !listing ||
    listing.status !== 'active' ||
    listing.seller_id === user.id ||
    listing.listing_type === 'collection'
  ) {
    redirect(`/market/listing/${listingId}`);
  }

  const { data: myRows } = await supabase
    .from('market_listings')
    .select(`
      id, title, brand, model, size, condition, wear_state, model_year,
      market_listing_images(public_url, clean_public_url, use_clean, display_order)
    `)
    .eq('seller_id', user.id)
    .eq('status', 'active')
    .neq('listing_type', 'collection')
    .neq('id', listingId)
    .order('created_at', { ascending: false })
    .limit(50);

  const myListings = (myRows ?? []).map((row) => toSummary(row as ListingRow));

  return (
    <OfferFormClient
      listingId={listingId}
      listing={toSummary(listing as ListingRow)}
      myListings={myListings}
      defaultTrade={defaultTrade}
    />
  );
}
