import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
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
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: tradeId } = await params;
  const admin = createAdminClient(tenant.slug);

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

  if (!ACTIVE_TRADE_STATUSES.includes(trade.status as (typeof ACTIVE_TRADE_STATUSES)[number])) {
    return NextResponse.json({ error: 'Only active fee-window trades can be cancelled' }, { status: 400 });
  }

  const stripe = getStripeInstance(tenant.slug);
  const { refunded } = await terminateActiveTrade(admin, stripe, trade as TradeLifecycleRow, {
    finalStatus: 'cancelled',
  });

  return NextResponse.json({ success: true, refunded });
}
