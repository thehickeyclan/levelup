import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tenants } from '@/config/tenants';
import { getStripeInstance } from '@/lib/stripe/webhooks';
import {
  listingIdsInActiveTrades,
  terminateActiveTrade,
  type TradeLifecycleRow,
} from '@/lib/market/trade-lifecycle';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (process.env.NODE_ENV === 'production') {
    const ok = secret && (auth === `Bearer ${secret}` || querySecret === secret);
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, {
    locksReleased: number;
    ordersCancelled: number;
    tradesExpired: number;
    tradeFeeWindowsExpired: number;
    offersExpired: number;
    draftsDeleted: number;
  }> = {};

  for (const slug of Object.keys(tenants)) {
    const admin = createAdminClient(slug);
    let locksReleased = 0;
    let ordersCancelled = 0;
    let tradesExpired = 0;
    let tradeFeeWindowsExpired = 0;
    let offersExpired = 0;
    let draftsDeleted = 0;

    const tradeLockedListingIds = await listingIdsInActiveTrades(admin);

    const { data: staleLocks } = await admin
      .from('market_listings')
      .select('id')
      .eq('status', 'active')
      .not('locked_at', 'is', null)
      .lt('locked_at', new Date(Date.now() - 35 * 60 * 1000).toISOString());

    const checkoutStaleLocks = (staleLocks ?? []).filter(
      (r) => !tradeLockedListingIds.has(r.id as string)
    );

    if (checkoutStaleLocks.length) {
      await admin
        .from('market_listings')
        .update({ locked_buyer_id: null, locked_at: null })
        .in('id', checkoutStaleLocks.map((r) => r.id));
      locksReleased = checkoutStaleLocks.length;
    }

    const { data: staleOrders } = await admin
      .from('market_orders')
      .select('id, listing_id')
      .eq('status', 'pending_payment')
      .lt('created_at', new Date(Date.now() - 35 * 60 * 1000).toISOString());

    if (staleOrders?.length) {
      await admin.from('market_orders').update({ status: 'cancelled' }).in('id', staleOrders.map((o) => o.id));
      for (const o of staleOrders) {
        await admin
          .from('market_listings')
          .update({ locked_buyer_id: null, locked_at: null })
          .eq('id', o.listing_id);
      }
      ordersCancelled = staleOrders.length;
    }

    const { data: expiredTrades } = await admin
      .from('market_trades')
      .select('id')
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());

    if (expiredTrades?.length) {
      await admin.from('market_trades').update({ status: 'expired' }).in('id', expiredTrades.map((t) => t.id));
      tradesExpired = expiredTrades.length;
    }

    const stripe = getStripeInstance(slug);
    const { data: staleFeeTrades } = await admin
      .from('market_trades')
      .select(`
        id, initiator_id, receiver_id,
        initiator_listing_id, receiver_listing_id,
        initiator_fee_paid, receiver_fee_paid,
        initiator_stripe_session_id, receiver_stripe_session_id
      `)
      .in('status', ['receiver_accepted', 'fees_pending'])
      .lt('expires_at', new Date().toISOString());

    for (const trade of staleFeeTrades ?? []) {
      await terminateActiveTrade(admin, stripe, trade as TradeLifecycleRow, {
        finalStatus: 'expired',
      });
      tradeFeeWindowsExpired += 1;
    }

    const { data: expiredOffers } = await admin
      .from('market_offers')
      .select('id')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    if (expiredOffers?.length) {
      await admin.from('market_offers').update({ status: 'expired' }).in('id', expiredOffers.map((o) => o.id));
      offersExpired = expiredOffers.length;
    }

    const { data: staleDrafts } = await admin
      .from('market_listings')
      .select('id')
      .eq('status', 'draft')
      .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (staleDrafts?.length) {
      const draftIds = staleDrafts.map((d) => d.id);
      const { data: withImages } = await admin
        .from('market_listing_images')
        .select('listing_id')
        .in('listing_id', draftIds);
      const hasImage = new Set((withImages ?? []).map((i) => i.listing_id as string));
      const toDelete = draftIds.filter((id) => !hasImage.has(id));
      if (toDelete.length) {
        await admin.from('market_listings').delete().in('id', toDelete);
        draftsDeleted = toDelete.length;
      }
    }

    results[slug] = {
      locksReleased,
      ordersCancelled,
      tradesExpired,
      tradeFeeWindowsExpired,
      offersExpired,
      draftsDeleted,
    };
  }

  return NextResponse.json({ ok: true, results });
}
