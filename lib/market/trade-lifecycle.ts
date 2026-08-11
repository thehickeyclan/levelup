import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { createNotification } from '@/lib/notifications';

export const ACTIVE_TRADE_STATUSES = ['receiver_accepted', 'fees_pending'] as const;

export type TradeLifecycleRow = {
  id: string;
  initiator_id: string;
  receiver_id: string;
  initiator_listing_id: string;
  receiver_listing_id: string;
  initiator_fee_paid: boolean;
  receiver_fee_paid: boolean;
  initiator_stripe_session_id: string | null;
  receiver_stripe_session_id: string | null;
};

export type TradeFeePaidSide = {
  userId: string;
  sessionId: string | null;
  side: 'initiator' | 'receiver';
};

/** Side that paid the trade fee when exactly one party has paid. */
export function tradeFeePaidSide(trade: TradeLifecycleRow): TradeFeePaidSide | null {
  if (trade.initiator_fee_paid && !trade.receiver_fee_paid) {
    return {
      userId: trade.initiator_id,
      sessionId: trade.initiator_stripe_session_id,
      side: 'initiator',
    };
  }
  if (trade.receiver_fee_paid && !trade.initiator_fee_paid) {
    return {
      userId: trade.receiver_id,
      sessionId: trade.receiver_stripe_session_id,
      side: 'receiver',
    };
  }
  return null;
}

export async function lockListingsForTrade(
  admin: SupabaseClient,
  listingIds: string[],
  lockBuyerId: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('market_listings')
    .update({ locked_buyer_id: lockBuyerId, locked_at: now })
    .in('id', listingIds)
    .eq('status', 'active')
    .is('locked_buyer_id', null)
    .select('id');

  if (error) return false;
  return (data?.length ?? 0) === listingIds.length;
}

export async function reactivateTradeListings(
  admin: SupabaseClient,
  listingIds: string[]
): Promise<void> {
  await admin
    .from('market_listings')
    .update({
      status: 'active',
      locked_buyer_id: null,
      locked_at: null,
    })
    .in('id', listingIds);
}

export async function completeTradeListings(
  admin: SupabaseClient,
  listingIds: string[]
): Promise<void> {
  await admin
    .from('market_listings')
    .update({
      status: 'traded',
      locked_buyer_id: null,
      locked_at: null,
    })
    .in('id', listingIds);
}

export async function refundTradeFeePayment(
  stripe: Stripe,
  sessionId: string | null | undefined
): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paymentIntent =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntent) return false;
    await stripe.refunds.create({
      payment_intent: paymentIntent,
      reason: 'requested_by_customer',
    });
    return true;
  } catch (err) {
    console.error('Trade fee refund failed:', sessionId, err);
    return false;
  }
}

export async function listingIdsInActiveTrades(admin: SupabaseClient): Promise<Set<string>> {
  const { data } = await admin
    .from('market_trades')
    .select('initiator_listing_id, receiver_listing_id')
    .in('status', [...ACTIVE_TRADE_STATUSES]);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    ids.add(row.initiator_listing_id as string);
    ids.add(row.receiver_listing_id as string);
  }
  return ids;
}

export async function terminateActiveTrade(
  admin: SupabaseClient,
  stripe: Stripe | null,
  trade: TradeLifecycleRow,
  options: {
    finalStatus: 'expired' | 'cancelled';
    cancelledByUserId?: string;
  }
): Promise<{ refunded: boolean }> {
  const listingIds = [trade.initiator_listing_id, trade.receiver_listing_id];
  const paidSide = tradeFeePaidSide(trade);

  let refunded = false;
  if (paidSide && stripe) {
    refunded = await refundTradeFeePayment(stripe, paidSide.sessionId);
  }

  await admin.from('market_trades').update({ status: options.finalStatus }).eq('id', trade.id);
  await reactivateTradeListings(admin, listingIds);

  const ghostedId =
    paidSide?.side === 'initiator' ? trade.receiver_id : paidSide ? trade.initiator_id : null;

  if (options.finalStatus === 'expired') {
    if (paidSide) {
      await createNotification(admin, {
        user_id: paidSide.userId,
        type: 'market_trade_expired',
        title: 'Trade expired — fee refunded',
        body: refunded
          ? "The other party didn't complete their fee in time. Your $4.99 has been refunded."
          : "The other party didn't complete their fee in time. Contact support if your fee wasn't refunded.",
        data: { trade_id: trade.id, link: '/market/offers' },
      });
    }
    if (ghostedId) {
      await createNotification(admin, {
        user_id: ghostedId,
        type: 'market_trade_expired',
        title: 'Trade expired',
        body: 'This trade expired because the fee window closed.',
        data: { trade_id: trade.id, link: '/market/offers' },
      });
    }
    if (!paidSide) {
      await createNotification(admin, {
        user_id: trade.initiator_id,
        type: 'market_trade_expired',
        title: 'Trade expired',
        body: 'This trade expired because neither party completed the fee in time.',
        data: { trade_id: trade.id, link: '/market/offers' },
      });
      await createNotification(admin, {
        user_id: trade.receiver_id,
        type: 'market_trade_expired',
        title: 'Trade expired',
        body: 'This trade expired because neither party completed the fee in time.',
        data: { trade_id: trade.id, link: '/market/offers' },
      });
    }
  } else {
    const cancellerId = options.cancelledByUserId;
    const otherId =
      cancellerId === trade.initiator_id
        ? trade.receiver_id
        : cancellerId === trade.receiver_id
          ? trade.initiator_id
          : null;

    const otherRefundBody = paidSide
      ? refunded
        ? 'The other party cancelled this trade. Your trade fee has been refunded.'
        : 'The other party cancelled this trade. Contact support if your fee was not refunded.'
      : 'The other party cancelled this trade.';

    if (cancellerId) {
      await createNotification(admin, {
        user_id: cancellerId,
        type: 'market_trade_cancelled',
        title: 'Trade cancelled',
        body: 'This trade was cancelled and both listings are active again.',
        data: { trade_id: trade.id, link: '/market/offers' },
      });
      if (otherId) {
        await createNotification(admin, {
          user_id: otherId,
          type: 'market_trade_cancelled',
          title: 'Trade cancelled',
          body: otherRefundBody,
          data: { trade_id: trade.id, link: '/market/offers' },
        });
      }
    } else {
      await createNotification(admin, {
        user_id: trade.initiator_id,
        type: 'market_trade_cancelled',
        title: 'Trade cancelled',
        body:
          paidSide?.userId === trade.initiator_id
            ? otherRefundBody
            : 'This trade was cancelled and both listings are active again.',
        data: { trade_id: trade.id, link: '/market/offers' },
      });
      await createNotification(admin, {
        user_id: trade.receiver_id,
        type: 'market_trade_cancelled',
        title: 'Trade cancelled',
        body:
          paidSide?.userId === trade.receiver_id
            ? otherRefundBody
            : 'The other party cancelled this trade.',
        data: { trade_id: trade.id, link: '/market/offers' },
      });
    }
  }

  return { refunded };
}
