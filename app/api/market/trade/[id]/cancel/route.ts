import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import {
  ACTIVE_TRADE_STATUSES,
  terminateActiveTrade,
  type TradeLifecycleRow,
} from '@/lib/market/trade-lifecycle';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);
  const { id: tradeId } = await params;

  const { data: trade } = await admin
    .from('market_trades')
    .select(`
      id, status, initiator_id, receiver_id,
      initiator_listing_id, receiver_listing_id,
      initiator_fee_paid, receiver_fee_paid,
      initiator_stripe_session_id, receiver_stripe_session_id
    `)
    .eq('id', tradeId)
    .maybeSingle();

  if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

  const isInitiator = trade.initiator_id === user!.id;
  const isReceiver = trade.receiver_id === user!.id;
  if (!isInitiator && !isReceiver) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!ACTIVE_TRADE_STATUSES.includes(trade.status as (typeof ACTIVE_TRADE_STATUSES)[number])) {
    return NextResponse.json({ error: 'Trade cannot be cancelled' }, { status: 400 });
  }

  const viewerPaid = isInitiator ? trade.initiator_fee_paid : trade.receiver_fee_paid;
  if (viewerPaid) {
    return NextResponse.json(
      { error: 'Contact support to cancel after paying your fee.' },
      { status: 403 }
    );
  }

  const stripe = getStripeInstance(tenant.slug);
  await terminateActiveTrade(admin, stripe, trade as TradeLifecycleRow, {
    finalStatus: 'cancelled',
    cancelledByUserId: user!.id,
  });

  return NextResponse.json({ success: true });
}
