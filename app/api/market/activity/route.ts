import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';

/**
 * GET /api/market/activity — everything the user has in motion on the
 * marketplace, as one feed in three buckets:
 *   needs_you   — a decision or payment is on them (offer to answer, checkout
 *                 to finish, trade to respond to, dispute)
 *   waiting     — they acted; the other side or the process is moving
 *   done        — finished history (capped)
 * Status lines are composed here so web and mobile use identical words.
 */

type ListingEmbed = {
  id?: string;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  market_listing_images?:
    | {
        public_url?: string | null;
        clean_public_url?: string | null;
        use_clean?: boolean | null;
        display_order?: number | null;
      }[]
    | null;
} | null;

export type ActivityItem = {
  key: string;
  kind: 'offer_in' | 'offer_pay' | 'offer_out' | 'order' | 'trade';
  title: string;
  image_url: string | null;
  line: string;
  status: string;
  amount_cents: number | null;
  listing_id: string | null;
  offer_id?: string;
  order_id?: string;
  trade_id?: string;
  expires_at?: string | null;
  is_buyer?: boolean;
  sort_at: string;
};

function firstEmbed<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function listingTitle(listing: ListingEmbed): string {
  if (!listing) return 'Wrestling shoes';
  return (
    [listing.brand, listing.model].filter(Boolean).join(' ') ||
    listing.title ||
    'Wrestling shoes'
  );
}

function listingImage(listing: ListingEmbed): string | null {
  const images = [...(listing?.market_listing_images ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );
  const primary = images[0];
  if (!primary) return null;
  return primary.use_clean && primary.clean_public_url
    ? primary.clean_public_url
    : primary.public_url ?? null;
}

function dollars(cents: number | null | undefined): string | null {
  return cents != null ? `$${Math.round(cents / 100)}` : null;
}

function expiresIn(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  if (msLeft <= 0) return 'expired';
  const hours = Math.floor(msLeft / 3_600_000);
  if (hours >= 1) return `expires in ${hours}h`;
  return `expires in ${Math.max(1, Math.floor(msLeft / 60_000))}m`;
}

const ORDER_DONE = new Set(['completed', 'refunded', 'cancelled']);
const TRADE_DONE = new Set(['completed', 'rejected', 'cancelled', 'expired']);

export async function GET() {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { tenant, user } = ctx;
  const supabase = createAdminClient(tenant.slug);
  const userId = user!.id;

  const listingEmbed =
    'market_listings!listing_id(id, title, brand, model, market_listing_images(public_url, clean_public_url, use_clean, display_order))';

  const { data: myListings } = await supabase
    .from('market_listings')
    .select('id')
    .eq('seller_id', userId);
  const myListingIds = (myListings ?? []).map((l) => l.id as string);

  const [incomingRes, sentRes, ordersRes, tradesRes] = await Promise.all([
    myListingIds.length
      ? supabase
          .from('market_offers')
          .select(
            `id, offer_type, amount_cents, status, created_at, expires_at, listing_id, buyer_id, accepted_order_id, accepted_trade_id, ${listingEmbed}`
          )
          .in('listing_id', myListingIds)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase
      .from('market_offers')
      .select(
        `id, offer_type, amount_cents, status, created_at, expires_at, listing_id, accepted_order_id, accepted_trade_id, ${listingEmbed}`
      )
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('market_orders')
      .select(
        `id, order_ref, status, amount_cents, created_at, listing_id, buyer_id, seller_id, ${listingEmbed}`
      )
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('market_trades')
      .select(
        'id, status, boot_amount_cents, created_at, initiator_id, receiver_id, receiver_listing_id, market_listings!receiver_listing_id(id, title, brand, model, market_listing_images(public_url, clean_public_url, use_clean, display_order))'
      )
      .or(`initiator_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const incoming = (incomingRes.data ?? []) as Record<string, unknown>[];
  const sent = (sentRes.data ?? []) as Record<string, unknown>[];
  const orders = (ordersRes.data ?? []) as Record<string, unknown>[];
  const trades = (tradesRes.data ?? []) as Record<string, unknown>[];

  // Buyer first names for incoming offers.
  const buyerIds = [...new Set(incoming.map((o) => o.buyer_id as string).filter(Boolean))];
  const buyerNames = new Map<string, string>();
  if (buyerIds.length) {
    const { data: buyers } = await supabase
      .from('users')
      .select('id, first_name')
      .in('id', buyerIds);
    for (const b of buyers ?? []) {
      const name = ((b.first_name as string | null) ?? '').trim();
      if (name) buyerNames.set(b.id as string, name);
    }
  }

  // An accepted offer that produced an order defers to the order's card:
  // the order is the live object from then on.
  const orderIds = new Set(orders.map((o) => o.id as string));

  const needs_you: ActivityItem[] = [];
  const waiting: ActivityItem[] = [];
  const done: ActivityItem[] = [];

  for (const o of incoming) {
    const listing = firstEmbed(o.market_listings as ListingEmbed | ListingEmbed[]);
    const status = o.status as string;
    const live =
      status === 'pending' && (!o.expires_at || new Date(o.expires_at as string) > new Date());
    const buyer = buyerNames.get(o.buyer_id as string) ?? 'A buyer';
    const amount = dollars(o.amount_cents as number | null);
    const item: ActivityItem = {
      key: `offer_in:${o.id}`,
      kind: 'offer_in',
      title: listingTitle(listing),
      image_url: listingImage(listing),
      line: live
        ? `${buyer} offered ${amount ?? 'a trade'} — ${expiresIn(o.expires_at as string)}`
        : status === 'accepted'
          ? `You accepted ${buyer}'s ${amount ?? 'trade'} offer`
          : `${buyer}'s ${amount ?? 'trade'} offer ${status === 'pending' ? 'expired' : status}`,
      status: live ? 'pending' : status === 'pending' ? 'expired' : status,
      amount_cents: (o.amount_cents as number | null) ?? null,
      listing_id: (o.listing_id as string | null) ?? null,
      offer_id: o.id as string,
      expires_at: (o.expires_at as string | null) ?? null,
      sort_at: o.created_at as string,
    };
    if (live) needs_you.push(item);
    else if (status === 'accepted' && !orderIds.has((o.accepted_order_id as string) ?? '')) waiting.push(item);
    else if (status !== 'accepted') done.push(item);
  }

  for (const o of sent) {
    const listing = firstEmbed(o.market_listings as ListingEmbed | ListingEmbed[]);
    const status = o.status as string;
    const live =
      status === 'pending' && (!o.expires_at || new Date(o.expires_at as string) > new Date());
    const amount = dollars(o.amount_cents as number | null);
    const acceptedOrderId = (o.accepted_order_id as string | null) ?? null;
    const payable = status === 'accepted' && acceptedOrderId && !orderIds.has(acceptedOrderId);
    const base: Omit<ActivityItem, 'kind' | 'line' | 'key'> = {
      title: listingTitle(listing),
      image_url: listingImage(listing),
      status: live ? 'pending' : status === 'pending' ? 'expired' : status,
      amount_cents: (o.amount_cents as number | null) ?? null,
      listing_id: (o.listing_id as string | null) ?? null,
      offer_id: o.id as string,
      expires_at: (o.expires_at as string | null) ?? null,
      sort_at: o.created_at as string,
    };
    if (payable) {
      needs_you.push({
        ...base,
        key: `offer_pay:${o.id}`,
        kind: 'offer_pay',
        order_id: acceptedOrderId!,
        line: `Your ${amount ?? 'trade'} offer was accepted — pay to lock it in`,
      });
    } else if (live) {
      waiting.push({
        ...base,
        key: `offer_out:${o.id}`,
        kind: 'offer_out',
        line: `You offered ${amount ?? 'a trade'} — ${expiresIn(o.expires_at as string)}`,
      });
    } else if (status !== 'accepted') {
      done.push({
        ...base,
        key: `offer_out:${o.id}`,
        kind: 'offer_out',
        line: `Your ${amount ?? 'trade'} offer ${status === 'pending' ? 'expired' : `was ${status}`}`,
      });
    }
  }

  for (const o of orders) {
    const listing = firstEmbed(o.market_listings as ListingEmbed | ListingEmbed[]);
    const status = o.status as string;
    const isBuyer = (o.buyer_id as string) === userId;
    const amount = dollars(o.amount_cents as number | null);
    const line =
      status === 'pending_payment'
        ? isBuyer
          ? `Finish checkout — ${amount}`
          : `Waiting on the buyer's payment — ${amount}`
        : status === 'paid'
          ? isBuyer
            ? `Paid ${amount} — waiting on shipment`
            : `Buyer paid ${amount} — time to ship`
          : status === 'shipped'
            ? isBuyer
              ? 'Shipped — on its way to you'
              : 'Shipped — on its way to the buyer'
            : status === 'delivered'
              ? isBuyer
                ? 'Delivered — confirm when it checks out'
                : 'Delivered to the buyer'
              : status === 'disputed'
                ? 'Dispute open — see the order'
                : `${isBuyer ? 'Purchase' : 'Sale'} ${status}${amount ? ` — ${amount}` : ''}`;
    const item: ActivityItem = {
      key: `order:${o.id}`,
      kind: 'order',
      title: listingTitle(listing),
      image_url: listingImage(listing),
      line,
      status,
      amount_cents: (o.amount_cents as number | null) ?? null,
      listing_id: (o.listing_id as string | null) ?? null,
      order_id: o.id as string,
      is_buyer: isBuyer,
      sort_at: o.created_at as string,
    };
    if (ORDER_DONE.has(status)) done.push(item);
    else if (
      status === 'disputed' ||
      (status === 'pending_payment' && isBuyer) ||
      (status === 'paid' && !isBuyer) ||
      (status === 'delivered' && isBuyer)
    )
      needs_you.push(item);
    else waiting.push(item);
  }

  for (const t of trades) {
    const listing = firstEmbed(t.market_listings as ListingEmbed | ListingEmbed[]);
    const status = t.status as string;
    const isReceiver = (t.receiver_id as string) === userId;
    const boot = (t.boot_amount_cents as number) > 0 ? ` + ${dollars(t.boot_amount_cents as number)}` : '';
    const line =
      status === 'pending'
        ? isReceiver
          ? `Trade offer on your pair${boot} — respond`
          : `Trade offered${boot} — waiting on them`
        : status === 'receiver_accepted' || status === 'fees_pending'
          ? 'Trade accepted — finishing up'
          : `Trade ${status.replaceAll('_', ' ')}`;
    const item: ActivityItem = {
      key: `trade:${t.id}`,
      kind: 'trade',
      title: listingTitle(listing),
      image_url: listingImage(listing),
      line,
      status,
      amount_cents: null,
      listing_id: null,
      trade_id: t.id as string,
      sort_at: t.created_at as string,
    };
    if (TRADE_DONE.has(status)) done.push(item);
    else if (status === 'pending' && isReceiver) needs_you.push(item);
    else waiting.push(item);
  }

  const byNewest = (a: ActivityItem, b: ActivityItem) =>
    new Date(b.sort_at).getTime() - new Date(a.sort_at).getTime();
  needs_you.sort(byNewest);
  waiting.sort(byNewest);
  done.sort(byNewest);

  return NextResponse.json({
    needs_you,
    waiting,
    done: done.slice(0, 20),
  });
}
