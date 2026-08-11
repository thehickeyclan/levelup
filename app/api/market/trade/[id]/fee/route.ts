import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { calcMarketTradeFees } from '@/lib/market/fees';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import { publicOriginForStripeRedirect } from '@/lib/stripe-redirect-origin';

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
    .select('id, initiator_id, receiver_id, status, boot_amount_cents, initiator_fee_paid, receiver_fee_paid')
    .eq('id', tradeId)
    .maybeSingle();

  if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

  const isInitiator = trade.initiator_id === user!.id;
  const isReceiver = trade.receiver_id === user!.id;
  if (!isInitiator && !isReceiver) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payerSide = isInitiator ? 'initiator' : 'receiver';
  const alreadyPaid =
    payerSide === 'initiator' ? trade.initiator_fee_paid : trade.receiver_fee_paid;
  if (alreadyPaid) {
    return NextResponse.json({ error: 'Fee already paid' }, { status: 400 });
  }

  if (!['receiver_accepted', 'fees_pending'].includes(trade.status as string)) {
    return NextResponse.json({ error: 'Trade is not ready for fee payment' }, { status: 400 });
  }

  const stripeEnabled = process.env.STRIPE_CHECKOUT_ENABLED === 'true';
  if (!stripeEnabled) {
    return NextResponse.json({ error: 'Online payment is not enabled' }, { status: 503 });
  }

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const origin = publicOriginForStripeRedirect(host, _req);
  const stripe = getStripeInstance(tenant.slug);
  const tradeFees = calcMarketTradeFees({
    bootAmountCents: trade.boot_amount_cents as number | null,
    paysBootFee: payerSide === 'initiator',
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'Guild Market trade protection fee' },
          unit_amount: tradeFees.baseFeeCents,
        },
        quantity: 1,
      },
      ...(tradeFees.bootFeeCents > 0
        ? [
            {
              price_data: {
                currency: 'usd',
                product_data: { name: 'Cash kicker fee (3%)' },
                unit_amount: tradeFees.bootFeeCents,
              },
              quantity: 1,
            },
          ]
        : []),
    ],
    success_url: `${origin}/market/trade/${tradeId}?fee_paid=true`,
    cancel_url: `${origin}/market/trade/${tradeId}`,
    metadata: {
      app: 'guild-market',
      market_trade_fee: 'true',
      tenant_slug: tenant.slug,
      trade_id: tradeId,
      payer_id: user!.id,
      payer_side: payerSide,
      boot_amount_cents: String(trade.boot_amount_cents ?? 0),
      base_fee_cents: String(tradeFees.baseFeeCents),
      boot_fee_cents: String(tradeFees.bootFeeCents),
      total_fee_cents: String(tradeFees.totalFeeCents),
    },
  });

  const sessionField =
    payerSide === 'initiator' ? 'initiator_stripe_session_id' : 'receiver_stripe_session_id';
  await admin.from('market_trades').update({ [sessionField]: session.id }).eq('id', tradeId);

  return NextResponse.json({ checkoutUrl: session.url });
}
