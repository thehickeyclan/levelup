import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { getSellerProfile } from '@/lib/market/seller';
import { primaryListingImageUrl } from '@/lib/market/listing-images';
import { ListingCheckoutClient } from './checkout-form-client';

export default async function ListingCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { id: listingId } = await params;
  const sp = await searchParams;
  const orderId = sp.order?.trim() || null;

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/market/listing/${listingId}/checkout`);

  const { data: listing } = await supabase
    .from('market_listings')
    .select(`
      id, title, brand, model, size, condition, wear_state, status, seller_id, price_cents, shipping_cents,
      locked_buyer_id,
      market_listing_images(public_url, display_order)
    `)
    .eq('id', listingId)
    .maybeSingle();

  if (!listing || listing.status !== 'active') {
    redirect(`/market/listing/${listingId}`);
  }

  let amountCents = listing.price_cents as number | null;
  let shippingCents = (listing.shipping_cents as number) ?? 0;
  let resolvedOrderId: string | null = null;

  if (orderId) {
    const { data: order } = await supabase
      .from('market_orders')
      .select('id, buyer_id, listing_id, amount_cents, shipping_cents, status')
      .eq('id', orderId)
      .maybeSingle();

    if (
      !order ||
      order.buyer_id !== user.id ||
      order.listing_id !== listingId ||
      order.status !== 'pending_payment'
    ) {
      redirect(`/market/listing/${listingId}`);
    }
    amountCents = order.amount_cents as number;
    shippingCents = (order.shipping_cents as number) ?? 0;
    resolvedOrderId = order.id as string;
  } else {
    if (listing.seller_id === user.id) redirect(`/market/listing/${listingId}`);
    if (!amountCents || amountCents <= 0) redirect(`/market/listing/${listingId}`);
    if (listing.locked_buyer_id && listing.locked_buyer_id !== user.id) {
      redirect(`/market/listing/${listingId}`);
    }
  }

  const seller = await getSellerProfile(supabase, listing.seller_id as string);

  return (
    <ListingCheckoutClient
      summary={{
        listingId,
        orderId: resolvedOrderId,
        title: listing.title as string,
        brand: listing.brand as string,
        model: listing.model as string,
        size: Number(listing.size),
        condition: listing.condition as string,
        wearState: listing.wear_state as string | null,
        sellerName: seller?.displayName ?? 'Guild member',
        imageUrl: primaryListingImageUrl(
          listing.market_listing_images as { public_url: string; display_order: number }[] | null
        ),
        amountCents: amountCents!,
        shippingCents,
      }}
    />
  );
}
