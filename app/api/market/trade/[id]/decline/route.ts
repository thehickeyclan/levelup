import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';

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
    .select('id, receiver_id, status')
    .eq('id', tradeId)
    .maybeSingle();

  if (!trade || trade.receiver_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (trade.status !== 'pending') {
    return NextResponse.json({ error: 'Trade is not pending' }, { status: 400 });
  }

  await admin.from('market_trades').update({ status: 'rejected' }).eq('id', tradeId);
  return NextResponse.json({ success: true });
}
