import type { SupabaseClient } from '@supabase/supabase-js';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import { primaryListingImageUrl } from '@/lib/market/listing-images';
import { ACTIVE_TRADE_STATUSES } from '@/lib/market/trade-lifecycle';
import { deriveListingModeConstraints } from '@/lib/market/listing-mode-guards';

export type MyListingRow = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  wear_state: string | null;
  status: string;
  listing_type: string;
  price_cents: number | null;
  open_to_trade: boolean;
  primary_image_url: string | null;
  condition_label: string;
  pending_offer_count: number;
  can_delete: boolean;
  can_archive: boolean;
  can_change_mode: boolean;
  mode_blocked_reason: string | null;
  active_trade_id: string | null;
};

type ListingDb = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  wear_state: string | null;
  status: string;
  listing_type: string;
  price_cents: number | null;
  open_to_trade: boolean;
  locked_buyer_id: string | null;
  market_listing_images: { public_url: string; display_order: number }[] | null;
};

export async function fetchMyListings(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  pairs: MyListingRow[];
  soldTraded: MyListingRow[];
  drafts: MyListingRow[];
  archived: MyListingRow[];
}> {
  const { data: rows } = await supabase
    .from('market_listings')
    .select(`
      id, title, brand, model, size, condition, wear_state, status, listing_type,
      price_cents, open_to_trade, locked_buyer_id,
      market_listing_images(public_url, clean_public_url, use_clean, display_order)
    `)
    .eq('seller_id', userId)
    .in('status', ['active', 'draft', 'sold', 'traded', 'archived', 'pending_sale'])
    .order('created_at', { ascending: false });

  const listings = (rows ?? []) as ListingDb[];
  const ids = listings.map((l) => l.id);

  const offerCounts = new Map<string, number>();
  const pendingOrderListingIds = new Set<string>();
  const tradeByListing = new Map<string, string>();

  if (ids.length) {
    const { data: offers } = await supabase
      .from('market_offers')
      .select('listing_id')
      .in('listing_id', ids)
      .eq('status', 'pending');
    for (const o of offers ?? []) {
      const lid = o.listing_id as string;
      offerCounts.set(lid, (offerCounts.get(lid) ?? 0) + 1);
    }

    const { data: pendingOrders } = await supabase
      .from('market_orders')
      .select('listing_id')
      .in('listing_id', ids)
      .in('status', ['pending_payment', 'paid', 'shipped']);
    for (const o of pendingOrders ?? []) {
      pendingOrderListingIds.add(o.listing_id as string);
    }

    const { data: activeTrades } = await supabase
      .from('market_trades')
      .select('id, initiator_listing_id, receiver_listing_id')
      .in('status', [...ACTIVE_TRADE_STATUSES]);

    for (const t of activeTrades ?? []) {
      const iid = t.initiator_listing_id as string;
      const rid = t.receiver_listing_id as string;
      if (ids.includes(iid)) tradeByListing.set(iid, t.id as string);
      if (ids.includes(rid)) tradeByListing.set(rid, t.id as string);
    }
  }

  const mapped: MyListingRow[] = listings.map((l) => {
    const wear = (l.wear_state as 'bnib' | 'new_no_box' | 'used' | null) || 'used';
    const pending = offerCounts.get(l.id) ?? 0;
    const hasPendingOrder = pendingOrderListingIds.has(l.id);
    const activeTradeId = tradeByListing.get(l.id) ?? null;
    const mode = deriveListingModeConstraints({
      locked_buyer_id: l.locked_buyer_id,
      active_trade_id: activeTradeId,
      pending_offer_count: pending,
    });
    return {
      id: l.id,
      title: l.title,
      brand: l.brand,
      model: l.model,
      size: Number(l.size),
      condition: l.condition,
      wear_state: l.wear_state,
      status: l.status,
      listing_type: l.listing_type,
      price_cents: l.price_cents,
      open_to_trade: l.open_to_trade,
      primary_image_url: primaryListingImageUrl(l.market_listing_images),
      condition_label: listingConditionDisplay(wear, l.condition),
      pending_offer_count: pending,
      can_delete:
        (l.status === 'draft' || l.status === 'active' || l.listing_type === 'collection') &&
        !hasPendingOrder &&
        pending === 0,
      can_archive: l.status === 'active' && !hasPendingOrder,
      can_change_mode: mode.can_change_mode,
      mode_blocked_reason: mode.blocked_reason,
      active_trade_id: mode.active_trade_id,
    };
  });

  return {
    pairs: mapped.filter((l) => l.status === 'active'),
    soldTraded: mapped.filter((l) => l.status === 'sold' || l.status === 'traded'),
    drafts: mapped.filter((l) => l.status === 'draft'),
    archived: mapped.filter((l) => l.status === 'archived'),
  };
}
