import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMarketBrowseListings, type MarketBrowseListing } from '@/lib/market/browse-listings';
import { fetchSellerPublicMetaBatch, sellerFallbackDisplayName } from '@/lib/market/seller';
import { rarityRank, type MarketRarity } from '@/lib/market/rarity';

export type MarketCollectorBrowse = {
  seller_id: string;
  display_name: string;
  school: string | null;
  photo_url: string | null;
  pair_count: number;
  preview_image_urls: string[];
  latest_activity_at: string;
  estimated_value_cents: number | null;
  top_rarity: MarketRarity | null;
  grail_count: number;
  rare_count: number;
  top_tier_count: number;
  rarity_score: number;
};

type SellerMeta = {
  display_name: string;
  school: string | null;
  photo_url: string | null;
};

async function fetchEstimatedValuesBySeller(
  supabase: SupabaseClient,
  listingsBySeller: Map<string, string[]>
): Promise<Map<string, number>> {
  const allIds = [...listingsBySeller.values()].flat();
  if (!allIds.length) return new Map();

  const { data: aiRows } = await supabase
    .from('market_ai_analysis')
    .select('listing_id, price_suggested_mid_cents')
    .in('listing_id', allIds)
    .not('price_suggested_mid_cents', 'is', null);

  const listingToSeller = new Map<string, string>();
  for (const [sellerId, ids] of listingsBySeller) {
    for (const id of ids) listingToSeller.set(id, sellerId);
  }

  const totals = new Map<string, number>();
  for (const row of aiRows ?? []) {
    const sellerId = listingToSeller.get(row.listing_id as string);
    if (!sellerId) continue;
    totals.set(sellerId, (totals.get(sellerId) ?? 0) + (Number(row.price_suggested_mid_cents) || 0));
  }
  return totals;
}

function sortPairsForCollectorPreview(pairs: MarketBrowseListing[]): MarketBrowseListing[] {
  return [...pairs].sort((a, b) => {
    const rankDiff = rarityRank(b.rarity) - rarityRank(a.rarity);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function summarizeCollectorRarity(pairs: MarketBrowseListing[]) {
  let top_rarity: MarketRarity | null = null;
  let top_rank = 0;
  let rarity_score = 0;
  let grail_count = 0;
  let rare_count = 0;
  let top_tier_count = 0;

  for (const pair of pairs) {
    const rank = rarityRank(pair.rarity);
    rarity_score += rank;
    if (rank > top_rank) {
      top_rank = rank;
      top_rarity = pair.rarity;
    }
    if (pair.rarity === 'grail') grail_count += 1;
    if (pair.rarity === 'rare') rare_count += 1;
  }

  if (top_rarity) {
    top_tier_count = pairs.filter((p) => p.rarity === top_rarity).length;
  }

  return { top_rarity, top_rank, rarity_score, grail_count, rare_count, top_tier_count };
}

export function compareCollectorsByRarity(a: MarketCollectorBrowse, b: MarketCollectorBrowse): number {
  const aRank = rarityRank(a.top_rarity);
  const bRank = rarityRank(b.top_rarity);
  if (bRank !== aRank) return bRank - aRank;

  if (b.top_tier_count !== a.top_tier_count) return b.top_tier_count - a.top_tier_count;
  if (b.rarity_score !== a.rarity_score) return b.rarity_score - a.rarity_score;

  if (b.pair_count !== a.pair_count) return b.pair_count - a.pair_count;
  return new Date(b.latest_activity_at).getTime() - new Date(a.latest_activity_at).getTime();
}

function buildCollectorEntry(
  sellerId: string,
  pairs: MarketBrowseListing[],
  meta: SellerMeta | undefined,
  estimated_value_cents: number | null
): MarketCollectorBrowse {
  const sorted = sortPairsForCollectorPreview(pairs);
  const { top_rarity, grail_count, rare_count, top_tier_count, rarity_score } = summarizeCollectorRarity(pairs);
  const preview_image_urls = sorted
    .map((p) => p.primary_image_url)
    .filter((url): url is string => Boolean(url))
    .slice(0, 4);

  return {
    seller_id: sellerId,
    display_name: meta?.display_name ?? pairs[0]?.seller_name ?? sellerFallbackDisplayName(sellerId),
    school: meta?.school ?? null,
    photo_url: meta?.photo_url ?? null,
    pair_count: pairs.length,
    preview_image_urls,
    latest_activity_at: sorted[0]?.created_at ?? '',
    estimated_value_cents,
    top_rarity,
    grail_count,
    rare_count,
    top_tier_count,
    rarity_score,
  };
}

export function buildCollectorBrowseFromListings(
  listings: MarketBrowseListing[],
  sellerMeta: Map<string, SellerMeta>,
  valueBySeller: Map<string, number>
): MarketCollectorBrowse[] {
  const groups = new Map<string, MarketBrowseListing[]>();
  for (const listing of listings) {
    const sellerId = listing.seller_id;
    if (!sellerId) continue;
    const bucket = groups.get(sellerId) ?? [];
    bucket.push(listing);
    groups.set(sellerId, bucket);
  }

  const collectors: MarketCollectorBrowse[] = [];
  for (const [sellerId, pairs] of groups) {
    const meta = sellerMeta.get(sellerId);
    collectors.push(
      buildCollectorEntry(sellerId, pairs, meta, valueBySeller.get(sellerId) ?? null)
    );
  }

  collectors.sort(compareCollectorsByRarity);

  return collectors;
}

/** Filter collectors to those with matching pairs; refresh counts and previews from filtered listings. */
export function filterCollectorsForListings(
  collectors: MarketCollectorBrowse[],
  allListings: MarketBrowseListing[],
  filteredListings: MarketBrowseListing[]
): MarketCollectorBrowse[] {
  if (filteredListings.length === allListings.length) return collectors;

  const bySeller = new Map<string, MarketBrowseListing[]>();
  for (const listing of filteredListings) {
    const sellerId = listing.seller_id;
    if (!sellerId) continue;
    const bucket = bySeller.get(sellerId) ?? [];
    bucket.push(listing);
    bySeller.set(sellerId, bucket);
  }

  return collectors
    .filter((c) => bySeller.has(c.seller_id))
    .map((c) => {
      const matches = bySeller.get(c.seller_id)!;
      return buildCollectorEntry(
        c.seller_id,
        matches,
        {
          display_name: c.display_name,
          school: c.school,
          photo_url: c.photo_url,
        },
        c.estimated_value_cents
      );
    })
    .sort(compareCollectorsByRarity);
}

export async function fetchMarketCollectorBrowseData(
  supabase: SupabaseClient,
  tenantSlug: string
): Promise<{ collectors: MarketCollectorBrowse[]; listings: MarketBrowseListing[] }> {
  const listings = await fetchMarketBrowseListings(supabase, tenantSlug, { collectorsOnly: true });
  const sellerIds = [...new Set(listings.map((l) => l.seller_id).filter(Boolean))] as string[];

  const listingsBySeller = new Map<string, string[]>();
  for (const listing of listings) {
    if (!listing.seller_id) continue;
    const ids = listingsBySeller.get(listing.seller_id) ?? [];
    ids.push(listing.id);
    listingsBySeller.set(listing.seller_id, ids);
  }

  const [sellerMetaBatch, valueBySeller] = await Promise.all([
    fetchSellerPublicMetaBatch(tenantSlug, sellerIds),
    fetchEstimatedValuesBySeller(supabase, listingsBySeller),
  ]);

  const sellerMeta = new Map<string, SellerMeta>();
  for (const [id, meta] of sellerMetaBatch) {
    sellerMeta.set(id, {
      display_name: meta.displayName,
      school: meta.school,
      photo_url: meta.photoUrl,
    });
  }

  const collectors = buildCollectorBrowseFromListings(listings, sellerMeta, valueBySeller);
  return { collectors, listings };
}
