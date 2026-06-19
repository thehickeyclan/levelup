import type { SupabaseClient } from '@supabase/supabase-js';
import { listingConditionDisplay } from '@/lib/market/wear-state';
import { primaryListingImageUrl } from '@/lib/market/listing-images';

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
  market_listing_images: { public_url: string; display_order: number }[] | null;
};

export async function fetchMyListings(
  supabase: SupabaseClient,
  userId: string
): Promise<{ pairs: MyListingRow[]; soldTraded: MyListingRow[]; drafts: MyListingRow[] }> {
  const { data: rows } = await supabase
    .from('market_listings')
    .select(`
      id, title, brand, model, size, condition, wear_state, status, listing_type,
      price_cents, open_to_trade,
      market_listing_images(public_url, clean_public_url, use_clean, display_order)
    `)
    .eq('seller_id', userId)
    .in('status', ['active', 'draft', 'sold', 'traded', 'archived', 'pending_sale'])
    .order('created_at', { ascending: false });

  const listings = (rows ?? []) as ListingDb[];
  const ids = listings.map((l) => l.id);

  const offerCounts = new Map<string, number>();
  const pendingOrderListingIds = new Set<string>();

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
  }

  const mapped: MyListingRow[] = listings.map((l) => {
    const wear = (l.wear_state as 'bnib' | 'new_no_box' | 'used' | null) || 'used';
    const pending = offerCounts.get(l.id) ?? 0;
    const hasPendingOrder = pendingOrderListingIds.has(l.id);
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
    };
  });

  return {
    pairs: mapped.filter((l) => l.status === 'active'),
    soldTraded: mapped.filter((l) => l.status === 'sold' || l.status === 'traded'),
    drafts: mapped.filter((l) => l.status === 'draft'),
  };
}
