import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { formatSellerDisplayName } from '@/lib/market/seller';
import { primaryListingImageUrl } from '@/lib/market/listing-images';
import { TradeStatusClient } from './trade-status-client';

export default async function TradePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fee_paid?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const feePaidBanner = sp.fee_paid === 'true';

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/market/trade/${id}`);

  const { data: trade } = await supabase
    .from('market_trades')
    .select(`
      id, status, boot_amount_cents, initiator_id, receiver_id,
      initiator_fee_paid, receiver_fee_paid,
      initiator_listing_id, receiver_listing_id
    `)
    .eq('id', id)
    .maybeSingle();

  if (!trade) redirect('/market/offers');
  if (trade.initiator_id !== user.id && trade.receiver_id !== user.id) {
    redirect('/market/offers');
  }

  const [{ data: initiatorUser }, { data: receiverUser }, { data: initiatorListing }, { data: receiverListing }] =
    await Promise.all([
      supabase.from('users').select('first_name, last_name').eq('id', trade.initiator_id).maybeSingle(),
      supabase.from('users').select('first_name, last_name').eq('id', trade.receiver_id).maybeSingle(),
      supabase
        .from('market_listings')
        .select('id, title, model, size, market_listing_images(public_url, display_order)')
        .eq('id', trade.initiator_listing_id)
        .maybeSingle(),
      supabase
        .from('market_listings')
        .select('id, title, model, size, market_listing_images(public_url, display_order)')
        .eq('id', trade.receiver_listing_id)
        .maybeSingle(),
    ]);

  if (!initiatorListing || !receiverListing) redirect('/market/offers');

  const isInitiator = trade.initiator_id === user.id;
  const otherId = isInitiator ? trade.receiver_id : trade.initiator_id;
  const otherUser = isInitiator ? receiverUser : initiatorUser;

  return (
    <TradeStatusClient
      feePaidBanner={feePaidBanner}
      trade={{
        id: trade.id as string,
        status: trade.status as string,
        boot_amount_cents: trade.boot_amount_cents as number,
        initiator_fee_paid: trade.initiator_fee_paid as boolean,
        receiver_fee_paid: trade.receiver_fee_paid as boolean,
        initiator_name: formatSellerDisplayName(
          initiatorUser?.first_name as string,
          initiatorUser?.last_name as string
        ),
        receiver_name: formatSellerDisplayName(
          receiverUser?.first_name as string,
          receiverUser?.last_name as string
        ),
        viewer_side: isInitiator ? 'initiator' : 'receiver',
        viewer_fee_paid: isInitiator ? trade.initiator_fee_paid : trade.receiver_fee_paid,
        other_party_name: formatSellerDisplayName(
          otherUser?.first_name as string,
          otherUser?.last_name as string
        ),
        initiator_listing: {
          id: initiatorListing.id as string,
          title: initiatorListing.title as string,
          model: initiatorListing.model as string,
          size: Number(initiatorListing.size),
          imageUrl: primaryListingImageUrl(
            initiatorListing.market_listing_images as { public_url: string; display_order: number }[] | null
          ),
        },
        receiver_listing: {
          id: receiverListing.id as string,
          title: receiverListing.title as string,
          model: receiverListing.model as string,
          size: Number(receiverListing.size),
          imageUrl: primaryListingImageUrl(
            receiverListing.market_listing_images as { public_url: string; display_order: number }[] | null
          ),
        },
      }}
    />
  );
}
