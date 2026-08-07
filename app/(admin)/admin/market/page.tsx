import { redirect } from 'next/navigation';
import Link from 'next/link';
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

type UserContactRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type AthletePayoutRow = {
  id: string;
  payout_method?: string | null;
  venmo_handle?: string | null;
  zelle_email?: string | null;
};

function userDisplayName(user: UserContactRow | undefined, fallback: string) {
  if (!user) return fallback;
  return (
    formatSellerDisplayName(user.first_name ?? '', user.last_name ?? '') ||
    user.email?.split('@')[0] ||
    fallback
  );
}

function userContact(user: UserContactRow | undefined) {
  if (!user) return 'No contact on file';
  return [user.email, user.phone].filter(Boolean).join(' · ') || 'No contact on file';
}

function payoutContact(user: UserContactRow | undefined, payout: AthletePayoutRow | undefined) {
  const parts = [
    payout?.payout_method ? `Prefers ${payout.payout_method}` : null,
    payout?.venmo_handle ? `Venmo ${payout.venmo_handle}` : null,
    payout?.zelle_email ? `Zelle ${payout.zelle_email}` : null,
    user?.phone ? `Phone ${user.phone}` : null,
    user?.email ? `Email ${user.email}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No payout contact on file';
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
          'id, order_ref, status, amount_cents, shipping_cents, platform_fee_cents, seller_payout_cents, created_at, updated_at, seller_paid_at, seller_payout_method, seller_payout_reference, seller_payout_note, buyer_id, seller_id, payout_recipient_id, shipping_carrier, tracking_number, shipped_at, delivered_at, market_listings(title, brand, model)'
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
          'id, offer_type, amount_cents, status, expires_at, buyer_id, trade_listing_id, market_listings!listing_id(title, brand, model)'
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
    userIds.add(o.payout_recipient_id as string);
  }
  for (const o of offerRows ?? []) userIds.add(o.buyer_id as string);

  const { data: users } = userIds.size
    ? await admin.from('users').select('id, first_name, last_name, email, phone').in('id', [...userIds])
    : { data: [] };
  const userContactMap = new Map(
    ((users ?? []) as UserContactRow[]).map((u) => [u.id, u])
  );

  const { data: athletePayouts } = userIds.size
    ? await admin
        .from('athletes')
        .select('id, payout_method, venmo_handle, zelle_email')
        .in('id', [...userIds])
    : { data: [] };
  const athletePayoutMap = new Map(
    ((athletePayouts ?? []) as AthletePayoutRow[]).map((a) => [a.id, a])
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

  const orderIds = (orderRows ?? []).map((o) => o.id as string);
  const tradeIds = (tradeRows ?? []).map((t) => t.id as string);

  const [{ data: orderThreadRows }, { data: tradeThreadRows }] = await Promise.all([
    orderIds.length
      ? admin.from('guild_threads').select('id, order_id').eq('thread_type', 'order').in('order_id', orderIds)
      : Promise.resolve({ data: [] as { id: string; order_id: string }[] }),
    tradeIds.length
      ? admin.from('guild_threads').select('id, trade_id').eq('thread_type', 'trade').in('trade_id', tradeIds)
      : Promise.resolve({ data: [] as { id: string; trade_id: string }[] }),
  ]);

  const orderThreadMap = new Map(
    (orderThreadRows ?? []).map((r) => [r.order_id as string, r.id as string])
  );
  const tradeThreadMap = new Map(
    (tradeThreadRows ?? []).map((r) => [r.trade_id as string, r.id as string])
  );

  const orders = (orderRows ?? []).map((o) => {
    const listing = o.market_listings as { title?: string; brand?: string; model?: string } | null;
    return {
      id: o.id as string,
      order_ref: o.order_ref as string,
      listing_title: listing?.title || [listing?.brand, listing?.model].filter(Boolean).join(' ') || 'Listing',
      buyer_label: userDisplayName(userContactMap.get(o.buyer_id as string), 'Buyer'),
      buyer_contact: userContact(userContactMap.get(o.buyer_id as string)),
      seller_label: userDisplayName(userContactMap.get(o.seller_id as string), 'Seller'),
      seller_contact: userContact(userContactMap.get(o.seller_id as string)),
      payout_recipient_label: userDisplayName(
        userContactMap.get(o.payout_recipient_id as string),
        'Payout recipient'
      ),
      payout_contact: payoutContact(
        userContactMap.get(o.payout_recipient_id as string),
        athletePayoutMap.get(o.payout_recipient_id as string)
      ),
      amount_cents: o.amount_cents as number,
      shipping_cents: (o.shipping_cents as number) ?? 0,
      platform_fee_cents: (o.platform_fee_cents as number) ?? 0,
      seller_payout_cents: (o.seller_payout_cents as number) ?? 0,
      status: o.status as string,
      created_at: o.created_at as string,
      updated_at: o.updated_at as string,
      seller_paid_at: o.seller_paid_at as string | null,
      seller_payout_method: o.seller_payout_method as string | null,
      seller_payout_reference: o.seller_payout_reference as string | null,
      seller_payout_note: o.seller_payout_note as string | null,
      shipping_carrier: o.shipping_carrier as string | null,
      tracking_number: o.tracking_number as string | null,
      shipped_at: o.shipped_at as string | null,
      delivered_at: o.delivered_at as string | null,
      thread_id: orderThreadMap.get(o.id as string) ?? null,
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
    thread_id: tradeThreadMap.get(t.id as string) ?? null,
  }));

  const offers = (offerRows ?? []).map((o) => {
    const listing = o.market_listings as { title?: string; brand?: string; model?: string } | null;
    return {
      id: o.id as string,
      listing_title: listing?.title || [listing?.brand, listing?.model].filter(Boolean).join(' ') || 'Listing',
      buyer_label: userDisplayName(userContactMap.get(o.buyer_id as string), 'Buyer'),
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
      <div className="mb-8 space-y-4">
        <div>
          <h1 className="text-3xl font-bold font-serif text-foreground">Guild Market ops</h1>
          <p className="text-muted-foreground mt-1">Orders, trades, offers, and AI usage — not the public browse feed.</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <p className="text-sm text-muted-foreground">
            To browse listings or add collection pairs, use the member marketplace. Listings are saved under whoever is signed in.
          </p>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link
              href="/market"
              className="inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
            >
              Browse marketplace
            </Link>
            <Link
              href="/market/listing/new?type=collection"
              className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:border-accent/40"
            >
              Add collection pair
            </Link>
          </div>
        </div>
      </div>
      <MarketAdminClient
        orders={orders}
        trades={trades}
        offers={offers}
        aiCosts={aiCosts}
        aiTotalCents={aiTotalCents}
        adminUserId={user.id}
      />
    </div>
  );
}
