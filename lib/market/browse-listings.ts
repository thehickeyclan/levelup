import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSellerPublicMetaBatch, sellerFallbackDisplayName } from '@/lib/market/seller';
import { MARKET_LISTING_IMAGE_FIELDS, primaryListingImageUrl } from '@/lib/market/listing-images';
import { BROWSE_BRANDS } from '@/lib/market/brands';
import {
  effectiveListingColorFamily,
  listingBrowseColorFamilies,
  parseColorFamily,
  type ColorFamilyId,
} from '@/lib/market/color-family';
import { normalizeMarketRarity, type MarketRarity } from '@/lib/market/rarity';

export { BROWSE_BRANDS };

export type MarketBrowseListing = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  wear_state: string | null;
  colorway: string | null;
  color_family: ColorFamilyId | null;
  browse_color: ColorFamilyId | null;
  browse_colors: ColorFamilyId[];
  price_cents: number | null;
  listing_type: 'sell' | 'trade' | 'vault' | 'collection';
  open_to_trade: boolean;
  accepts_offers: boolean;
  ai_assisted: boolean;
  primary_image_url: string | null;
  seller_id: string;
  seller_name: string;
  created_at: string;
  views_count: number;
  pending_offer_count: number;
  rarity: MarketRarity | null;
};

type ListingRow = {
  id: string;
  title: string;
  brand: string;
  model: string;
  size: number;
  condition: string;
  wear_state: string | null;
  colorway: string | null;
  color_family: string | null;
  price_cents: number | null;
  listing_type: string;
  open_to_trade: boolean;
  accepts_offers?: boolean;
  seller_id: string;
  created_at: string;
  views_count: number;
  rarity?: string | null;
  market_listing_images: { public_url: string; clean_public_url?: string | null; use_clean?: boolean; display_order: number }[] | null;
  market_ai_analysis: { analyzed_at?: string } | { analyzed_at?: string }[] | null;
};

export type BrowseListingQueryOptions = {
  collectorsOnly?: boolean;
  /** Include sell, trade, vault, and collection in one feed (browse "All"). */
  allTypes?: boolean;
  minPrice?: number;
  maxPrice?: number;
  /** Default 48 for sale browse; collectors 500; all-types 150. */
  limit?: number;
};

const BROWSE_SELECT_WITH_RARITY = `
  id, title, brand, model, size, condition, wear_state, colorway, color_family, rarity, price_cents,
  listing_type, open_to_trade, accepts_offers, seller_id, created_at, views_count,
  market_listing_images(${MARKET_LISTING_IMAGE_FIELDS}),
  market_ai_analysis(analyzed_at)
`;

const BROWSE_SELECT_WITH_COLOR_FAMILY = `
  id, title, brand, model, size, condition, wear_state, colorway, color_family, price_cents,
  listing_type, open_to_trade, accepts_offers, seller_id, created_at, views_count,
  market_listing_images(${MARKET_LISTING_IMAGE_FIELDS}),
  market_ai_analysis(analyzed_at)
`;

const BROWSE_SELECT_LEGACY = `
  id, title, brand, model, size, condition, wear_state, colorway, price_cents,
  listing_type, open_to_trade, seller_id, created_at, views_count,
  market_listing_images(${MARKET_LISTING_IMAGE_FIELDS}),
  market_ai_analysis(analyzed_at)
`;

/** Active browse feed — newest first. */
export async function fetchMarketBrowseListings(
  supabase: SupabaseClient,
  tenantSlug: string,
  options?: BrowseListingQueryOptions
): Promise<MarketBrowseListing[]> {
  const collectorsOnly = options?.collectorsOnly === true;
  const allTypes = options?.allTypes === true;
  const limit =
    options?.limit ?? (collectorsOnly ? 500 : allTypes ? 150 : 48);

  const runQuery = async (select: string) => {
    let q = supabase
      .from('market_listings')
      .select(select)
      .eq('tenant_slug', tenantSlug)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (collectorsOnly) {
      q = q.eq('listing_type', 'collection');
    } else if (!allTypes) {
      q = q.neq('listing_type', 'collection');
      if (options?.maxPrice != null) {
        q = q.lte('price_cents', options.maxPrice * 100);
      }
      if (options?.minPrice != null) {
        q = q.gte('price_cents', options.minPrice * 100);
      }
      if (options?.minPrice != null || options?.maxPrice != null) {
        q = q.not('price_cents', 'is', null);
      }
    }

    return q;
  };

  let result = await runQuery(BROWSE_SELECT_WITH_RARITY);

  if (result.error?.message?.includes('rarity')) {
    result = await runQuery(BROWSE_SELECT_WITH_COLOR_FAMILY);
  }

  if (result.error?.message?.includes('color_family')) {
    result = await runQuery(BROWSE_SELECT_LEGACY);
  }

  if (result.error?.message?.includes('accepts_offers')) {
    result = await runQuery(BROWSE_SELECT_LEGACY);
  }

  const { data, error } = result;

  if (error) {
    console.error('fetchMarketBrowseListings:', error);
    return [];
  }

  const rows = (data ?? []) as unknown as ListingRow[];
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
    const sellerMeta = await fetchSellerPublicMetaBatch(tenantSlug, sellerIds);
    for (const [id, meta] of sellerMeta) {
      sellerNames.set(id, meta.displayName);
    }
  }

  return rows.map((row) => {
    const ai = row.market_ai_analysis;
    const aiRow = Array.isArray(ai) ? ai[0] : ai;
    const colorway = typeof row.colorway === 'string' ? row.colorway.trim() || null : null;
    const color_family = parseColorFamily(row.color_family as string | null);
    const browse_colors = listingBrowseColorFamilies(color_family, colorway);
    return {
      id: row.id,
      title: row.title,
      brand: row.brand,
      model: row.model,
      size: Number(row.size),
      condition: row.condition,
      wear_state: row.wear_state,
      colorway,
      color_family: color_family,
      browse_color: effectiveListingColorFamily(color_family, colorway),
      browse_colors,
      price_cents: row.price_cents,
      listing_type: row.listing_type as 'sell' | 'trade' | 'vault' | 'collection',
      open_to_trade: row.open_to_trade,
      accepts_offers: Boolean(row.accepts_offers),
      ai_assisted: Boolean(aiRow?.analyzed_at),
      primary_image_url: primaryListingImageUrl(row.market_listing_images),
      seller_id: row.seller_id,
      seller_name: sellerNames.get(row.seller_id) ?? sellerFallbackDisplayName(row.seller_id as string),
      created_at: row.created_at,
      views_count: row.views_count ?? 0,
      pending_offer_count: offerCounts.get(row.id) ?? 0,
      rarity: normalizeMarketRarity(row.rarity ?? null),
    };
  });
}


export const BROWSE_US_SIZES: number[] = (() => {
  const sizes: number[] = [];
  for (let s = 5; s <= 15; s += 0.5) sizes.push(s);
  return sizes;
})();
