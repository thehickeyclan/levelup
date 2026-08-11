import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { createNotification } from '@/lib/notifications';
import { normalizePhone, sendSms } from '@/lib/twilio';

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
    .select('id, receiver_id, initiator_id, status')
    .eq('id', tradeId)
    .maybeSingle();

  if (!trade || trade.receiver_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (trade.status !== 'pending') {
    return NextResponse.json({ error: 'Trade is not pending' }, { status: 400 });
  }

  await admin.from('market_trades').update({ status: 'receiver_accepted' }).eq('id', tradeId);

  const { data: initiator } = await admin
    .from('users')
    .select('phone, first_name')
    .eq('id', trade.initiator_id)
    .maybeSingle();

  await createNotification(admin, {
    user_id: trade.initiator_id,
    type: 'market_trade_accepted',
    title: 'Trade accepted',
    body: 'Your trade offer was accepted. Pay the Guild trade fee to complete.',
    data: { trade_id: tradeId, link: `/market/trade/${tradeId}` },
  });

  const phone = normalizePhone(initiator?.phone as string | null | undefined);
  if (phone) {
    void sendSms(phone, 'Your Guild Market trade was accepted. Pay the Guild trade fee in the app to complete.', {
      admin,
      messageType: 'market_trade_accepted',
      recipientId: trade.initiator_id as string,
    });
  }

  return NextResponse.json({ success: true });
}
