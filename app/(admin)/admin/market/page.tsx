import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { formatSellerDisplayName } from '@/lib/market/seller';
import { MarketAdminClient } from './market-admin-client';

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  return new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export default async function AdminMarketPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') {
    const adminEmails = getAdminEmails();
    if (!adminEmails.has((user.email ?? '').toLowerCase())) redirect('/');
  }

  const admin = createAdminClient(tenant.slug);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: orderRows }, { data: tradeRows }, { data: offerRows }, { data: aiLogs }] =
    await Promise.all([
      admin
        .from('market_orders')
        .select(
          'id, order_ref, status, amount_cents, platform_fee_cents, seller_payout_cents, created_at, seller_paid_at, buyer_id, seller_id, market_listings(title, brand, model)'
        )
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('market_trades')
        .select('id, boot_amount_cents, status, initiator_fee_paid, receiver_fee_paid, created_at, initiator_listing_id, receiver_listing_id')
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('market_offers')
        .select(
          'id, offer_type, amount_cents, status, expires_at, buyer_id, trade_listing_id, market_listings(title, brand, model)'
        )
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('market_ai_logs')
        .select('route, tokens_in, tokens_out, cost_estimate_cents, created_at')
        .gte('created_at', since),
    ]);

  const userIds = new Set<string>();
  for (const o of orderRows ?? []) {
    userIds.add(o.buyer_id as string);
    userIds.add(o.seller_id as string);
  }
  for (const o of offerRows ?? []) userIds.add(o.buyer_id as string);

  const { data: users } = userIds.size
    ? await admin.from('users').select('id, first_name, last_name, email').in('id', [...userIds])
    : { data: [] };
  const userMap = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      formatSellerDisplayName(u.first_name as string, u.last_name as string) ||
        (u.email as string)?.split('@')[0] ||
        'User',
    ])
  );

  const listingIds = new Set<string>();
  for (const t of tradeRows ?? []) {
    listingIds.add(t.initiator_listing_id as string);
    listingIds.add(t.receiver_listing_id as string);
  }
  for (const o of offerRows ?? []) {
    if (o.trade_listing_id) listingIds.add(o.trade_listing_id as string);
  }

  const { data: tradeListings } = listingIds.size
    ? await admin.from('market_listings').select('id, title, brand, model').in('id', [...listingIds])
    : { data: [] };
  const listingMap = new Map(
    (tradeListings ?? []).map((l) => [
      l.id as string,
      [l.brand, l.model].filter(Boolean).join(' ') || (l.title as string),
    ])
  );

  const orders = (orderRows ?? []).map((o) => {
    const listing = o.market_listings as { title?: string; brand?: string; model?: string } | null;
    return {
      id: o.id as string,
      order_ref: o.order_ref as string,
      listing_title: listing?.title || [listing?.brand, listing?.model].filter(Boolean).join(' ') || 'Listing',
      buyer_label: userMap.get(o.buyer_id as string) ?? 'Buyer',
      seller_label: userMap.get(o.seller_id as string) ?? 'Seller',
      amount_cents: o.amount_cents as number,
      platform_fee_cents: (o.platform_fee_cents as number) ?? 0,
      seller_payout_cents: (o.seller_payout_cents as number) ?? 0,
      status: o.status as string,
      created_at: o.created_at as string,
      seller_paid_at: o.seller_paid_at as string | null,
    };
  });

  const trades = (tradeRows ?? []).map((t) => ({
    id: t.id as string,
    initiator_listing: listingMap.get(t.initiator_listing_id as string) ?? '—',
    receiver_listing: listingMap.get(t.receiver_listing_id as string) ?? '—',
    boot_amount_cents: t.boot_amount_cents as number,
    status: t.status as string,
    initiator_fee_paid: t.initiator_fee_paid as boolean,
    receiver_fee_paid: t.receiver_fee_paid as boolean,
    created_at: t.created_at as string,
  }));

  const offers = (offerRows ?? []).map((o) => {
    const listing = o.market_listings as { title?: string; brand?: string; model?: string } | null;
    return {
      id: o.id as string,
      listing_title: listing?.title || [listing?.brand, listing?.model].filter(Boolean).join(' ') || 'Listing',
      buyer_label: userMap.get(o.buyer_id as string) ?? 'Buyer',
      offer_type: o.offer_type as string,
      amount_cents: o.amount_cents as number | null,
      trade_listing_title: o.trade_listing_id
        ? listingMap.get(o.trade_listing_id as string) ?? null
        : null,
      status: o.status as string,
      expires_at: o.expires_at as string,
    };
  });

  const aiGrouped = new Map<string, { call_count: number; total_tokens: number; cost_cents: number }>();
  for (const log of aiLogs ?? []) {
    const day = (log.created_at as string).slice(0, 10);
    const route = log.route as string;
    const key = `${day}|${route}`;
    const prev = aiGrouped.get(key) ?? { call_count: 0, total_tokens: 0, cost_cents: 0 };
    prev.call_count += 1;
    prev.total_tokens += (log.tokens_in as number) + (log.tokens_out as number);
    prev.cost_cents += (log.cost_estimate_cents as number) ?? 0;
    aiGrouped.set(key, prev);
  }

  const aiCosts = [...aiGrouped.entries()].map(([key, v]) => {
    const [day, route] = key.split('|');
    return { day, route, ...v };
  });
  const aiTotalCents = aiCosts.reduce((s, r) => s + r.cost_cents, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-serif text-foreground">Guild Market</h1>
        <p className="text-muted-foreground mt-1">Orders, trades, offers, and AI usage</p>
      </div>
      <MarketAdminClient
        orders={orders}
        trades={trades}
        offers={offers}
        aiCosts={aiCosts}
        aiTotalCents={aiTotalCents}
      />
    </div>
  );
}
