import type { SupabaseClient } from '@supabase/supabase-js';
import { formatSellerDisplayName } from '@/lib/market/seller';
import { primaryListingImageUrl } from '@/lib/market/listing-images';

export type MarketBrowseListing = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  wear_state: string | null;
  price_cents: number | null;
  listing_type: 'sell' | 'trade' | 'vault';
  open_to_trade: boolean;
  ai_assisted: boolean;
  primary_image_url: string | null;
  seller_name: string;
  created_at: string;
  views_count: number;
  pending_offer_count: number;
};

type ListingRow = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  wear_state: string | null;
  price_cents: number | null;
  listing_type: string;
  open_to_trade: boolean;
  seller_id: string;
  created_at: string;
  views_count: number;
  market_listing_images: { public_url: string; display_order: number }[] | null;
  market_ai_analysis: { analyzed_at?: string } | { analyzed_at?: string }[] | null;
};

/** Active browse feed — newest first, max 48. */
export async function fetchMarketBrowseListings(
  supabase: SupabaseClient,
  tenantSlug: string
): Promise<MarketBrowseListing[]> {
  const { data, error } = await supabase
    .from('market_listings')
    .select(`
      id, title, brand, model, size, condition, wear_state, price_cents,
      listing_type, open_to_trade, seller_id, created_at, views_count,
      market_listing_images(public_url, display_order),
      market_ai_analysis(analyzed_at)
    `)
    .eq('tenant_slug', tenantSlug)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(48);

  if (error) {
    console.error('fetchMarketBrowseListings:', error);
    return [];
  }

  const rows = (data ?? []) as ListingRow[];
  const listingIds = rows.map((r) => r.id);
  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const sellerNames = new Map<string, string>();
  const offerCounts = new Map<string, number>();

  if (listingIds.length) {
    const { data: offers } = await supabase
      .from('market_offers')
      .select('listing_id')
      .in('listing_id', listingIds)
      .eq('status', 'pending');
    for (const o of offers ?? []) {
      const lid = o.listing_id as string;
      offerCounts.set(lid, (offerCounts.get(lid) ?? 0) + 1);
    }
  }

  if (sellerIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('id', sellerIds);
    for (const u of users ?? []) {
      sellerNames.set(
        u.id as string,
        formatSellerDisplayName(u.first_name as string, u.last_name as string)
      );
    }
  }

  return rows.map((row) => {
    const ai = row.market_ai_analysis;
    const aiRow = Array.isArray(ai) ? ai[0] : ai;
    return {
      id: row.id,
      title: row.title,
      brand: row.brand,
      model: row.model,
      size: Number(row.size),
      condition: row.condition,
      wear_state: row.wear_state,
      price_cents: row.price_cents,
      listing_type: row.listing_type as 'sell' | 'trade' | 'vault',
      open_to_trade: row.open_to_trade,
      ai_assisted: Boolean(aiRow?.analyzed_at),
      primary_image_url: primaryListingImageUrl(row.market_listing_images),
      seller_name: sellerNames.get(row.seller_id) ?? 'Guild member',
      created_at: row.created_at,
      views_count: row.views_count ?? 0,
      pending_offer_count: offerCounts.get(row.id) ?? 0,
    };
  });
}

/** Filter condition bucket for browse UI. */
export function browseConditionBucket(
  condition: string,
  wearState: string | null | undefined
): 'new' | 'like_new' | 'good' | 'fair' {
  if (condition === 'new' || wearState === 'bnib' || wearState === 'new_no_box') return 'new';
  if (condition === 'like_new' || condition === 'good' || condition === 'fair') {
    return condition;
  }
  return 'good';
}

export const BROWSE_BRANDS = ['Adidas', 'Asics', 'Nike', 'New Balance'] as const;

export const BROWSE_US_SIZES: number[] = (() => {
  const sizes: number[] = [];
  for (let s = 5; s <= 15; s += 0.5) sizes.push(s);
  return sizes;
})();
