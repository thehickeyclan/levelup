import type { SupabaseClient } from '@supabase/supabase-js';
import { findCatalogEntry } from '@/lib/market/shoe-id/catalog';
import {
  legacyColorwaysToProfiles,
  matchColorwayProfile,
  parseColorwayProfiles,
} from '@/lib/market/shoe-id/colorway-profiles';
import { normalizeMarketRarity, type MarketRarity } from '@/lib/market/rarity';

function rarityFromColorwayAvailability(
  availability: string | undefined
): MarketRarity | null {
  switch (availability) {
    case 'grail':
      return 'grail';
    case 'limited':
      return 'rare';
    case 'discontinued':
      return 'uncommon';
    case 'current_retail':
      return 'common';
    default:
      return null;
  }
}

/** Catalog + colorway profile → rarity (no AI). */
export async function resolveRarityFromCatalog(
  supabase: SupabaseClient,
  params: { brand: string; model: string; colorway?: string | null }
): Promise<MarketRarity | null> {
  const entry = await findCatalogEntry(supabase, params.brand, params.model);
  if (!entry) return null;

  const profiles = [
    ...parseColorwayProfiles(entry.colorway_profiles),
    ...legacyColorwaysToProfiles(entry.colorways as unknown[] | null),
  ];
  const colorwayMatch = matchColorwayProfile(profiles, params.colorway);

  if (colorwayMatch?.value_tier) {
    return normalizeMarketRarity(colorwayMatch.value_tier);
  }
  if (colorwayMatch) {
    const fromAvail = rarityFromColorwayAvailability(colorwayMatch.availability);
    if (fromAvail) return fromAvail;
  }

  return normalizeMarketRarity(entry.rarity as string | null);
}

/** Latest shoe_id_results row for this listing. */
export async function resolveRarityFromShoeIdResult(
  supabase: SupabaseClient,
  listingId: string
): Promise<MarketRarity | null> {
  const { data } = await supabase
    .from('shoe_id_results')
    .select('identified_rarity')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return normalizeMarketRarity(data?.identified_rarity as string | null);
}

export async function resolveListingRarity(
  supabase: SupabaseClient,
  params: {
    listingId?: string;
    brand: string;
    model: string;
    colorway?: string | null;
  }
): Promise<{ rarity: MarketRarity | null; source: 'catalog' | 'shoe_id' | null }> {
  const fromCatalog = await resolveRarityFromCatalog(supabase, params);
  if (fromCatalog) return { rarity: fromCatalog, source: 'catalog' };

  if (params.listingId) {
    const fromShoeId = await resolveRarityFromShoeIdResult(supabase, params.listingId);
    if (fromShoeId) return { rarity: fromShoeId, source: 'shoe_id' };
  }

  return { rarity: null, source: null };
}
