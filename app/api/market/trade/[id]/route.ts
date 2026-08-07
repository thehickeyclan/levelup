import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { findThreadIdByContext } from '@/lib/guild-messaging';
import { formatSellerDisplayName } from '@/lib/market/seller';
import {
  mapTradeListingReview,
  TRADE_LISTING_REVIEW_SELECT,
} from '@/lib/market/trade-listing-review';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);
  const { id } = await params;

  const { data: trade, error: tradeError } = await admin
    .from('market_trades')
    .select(`
      id, status, boot_amount_cents, initiator_id, receiver_id,
      initiator_fee_paid, receiver_fee_paid, expires_at,
      initiator_listing_id, receiver_listing_id
    `)
    .eq('id', id)
    .maybeSingle();

  if (tradeError) return NextResponse.json({ error: tradeError.message }, { status: 500 });
  if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

  const isInitiator = trade.initiator_id === user!.id;
  const isReceiver = trade.receiver_id === user!.id;
  if (!isInitiator && !isReceiver) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [
    { data: initiatorUser },
    { data: receiverUser },
    { data: initiatorListing },
    { data: receiverListing },
  ] = await Promise.all([
    admin.from('users').select('first_name, last_name').eq('id', trade.initiator_id).maybeSingle(),
    admin.from('users').select('first_name, last_name').eq('id', trade.receiver_id).maybeSingle(),
    admin.from('market_listings').select(TRADE_LISTING_REVIEW_SELECT).eq('id', trade.initiator_listing_id).maybeSingle(),
    admin.from('market_listings').select(TRADE_LISTING_REVIEW_SELECT).eq('id', trade.receiver_listing_id).maybeSingle(),
  ]);

  if (!initiatorListing || !receiverListing) {
    return NextResponse.json({ error: 'Trade listings not found' }, { status: 404 });
  }

  const otherUser = isInitiator ? receiverUser : initiatorUser;
  const threadId = await findThreadIdByContext(admin, 'trade', { tradeId: id });

  return NextResponse.json({
    trade: {
      id: trade.id,
      status: trade.status,
      boot_amount_cents: trade.boot_amount_cents ?? 0,
      initiator_fee_paid: trade.initiator_fee_paid === true,
      receiver_fee_paid: trade.receiver_fee_paid === true,
      viewer_side: isInitiator ? 'initiator' : 'receiver',
      viewer_fee_paid: isInitiator ? trade.initiator_fee_paid === true : trade.receiver_fee_paid === true,
      other_party_name: formatSellerDisplayName(
        otherUser?.first_name as string,
        otherUser?.last_name as string
      ),
      initiator_name: formatSellerDisplayName(
        initiatorUser?.first_name as string,
        initiatorUser?.last_name as string
      ),
      receiver_name: formatSellerDisplayName(
        receiverUser?.first_name as string,
        receiverUser?.last_name as string
      ),
      expires_at: trade.expires_at ?? null,
      initiator_listing: mapTradeListingReview(initiatorListing as Parameters<typeof mapTradeListingReview>[0]),
      receiver_listing: mapTradeListingReview(receiverListing as Parameters<typeof mapTradeListingReview>[0]),
      thread_id: threadId,
    },
  });
}
