import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { findThreadIdByContext } from '@/lib/guild-messaging';
import { formatSellerDisplayName } from '@/lib/market/seller';
import {
  mapTradeListingReview,
  TRADE_LISTING_REVIEW_SELECT,
  type TradeOfferListingReview,
} from '@/lib/market/trade-listing-review';
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
      initiator_fee_paid, receiver_fee_paid, expires_at,
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
        .select(TRADE_LISTING_REVIEW_SELECT)
        .eq('id', trade.initiator_listing_id)
        .maybeSingle(),
      supabase
        .from('market_listings')
        .select(TRADE_LISTING_REVIEW_SELECT)
        .eq('id', trade.receiver_listing_id)
        .maybeSingle(),
    ]);

  if (!initiatorListing || !receiverListing) redirect('/market/offers');

  const isInitiator = trade.initiator_id === user.id;
  const otherId = isInitiator ? trade.receiver_id : trade.initiator_id;
  const otherUser = isInitiator ? receiverUser : initiatorUser;

  const admin = createAdminClient(tenant.slug);
  const threadId = await findThreadIdByContext(admin, 'trade', { tradeId: id });

  return (
    <TradeStatusClient
      feePaidBanner={feePaidBanner}
      currentUserId={user.id}
      threadId={threadId}
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
        expires_at: (trade.expires_at as string | null) ?? null,
        initiator_listing: mapTradeListingReview(initiatorListing as Parameters<typeof mapTradeListingReview>[0]),
        receiver_listing: mapTradeListingReview(receiverListing as Parameters<typeof mapTradeListingReview>[0]),
      }}
    />
  );
}
