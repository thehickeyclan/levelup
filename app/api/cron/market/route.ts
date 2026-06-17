import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tenants } from '@/config/tenants';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (process.env.NODE_ENV === 'production') {
    const ok = secret && (auth === `Bearer ${secret}` || querySecret === secret);
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, { locksReleased: number; ordersCancelled: number; tradesExpired: number; draftsDeleted: number }> = {};

  for (const slug of Object.keys(tenants)) {
    const admin = createAdminClient(slug);
    let locksReleased = 0;
    let ordersCancelled = 0;
    let tradesExpired = 0;
    let draftsDeleted = 0;

    const { data: staleLocks } = await admin
      .from('market_listings')
      .select('id')
      .eq('status', 'active')
      .not('locked_at', 'is', null)
      .lt('locked_at', new Date(Date.now() - 35 * 60 * 1000).toISOString());

    if (staleLocks?.length) {
      await admin
        .from('market_listings')
        .update({ locked_buyer_id: null, locked_at: null })
        .in('id', staleLocks.map((r) => r.id));
      locksReleased = staleLocks.length;
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
      .lt('expires_at', new Date().toISOString());

    if (expiredTrades?.length) {
      await admin.from('market_trades').update({ status: 'expired' }).in('id', expiredTrades.map((t) => t.id));
      tradesExpired = expiredTrades.length;
    }

    const { data: staleDrafts } = await admin
      .from('market_listings')
      .select('id')
      .eq('status', 'draft')
      .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (staleDrafts?.length) {
      await admin.from('market_listings').delete().in('id', staleDrafts.map((d) => d.id));
      draftsDeleted = staleDrafts.length;
    }

    results[slug] = { locksReleased, ordersCancelled, tradesExpired, draftsDeleted };
  }

  return NextResponse.json({ ok: true, results });
}
