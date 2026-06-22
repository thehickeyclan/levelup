import type { SupabaseClient } from '@supabase/supabase-js';
import { inferColorFamilyFromColorway } from '@/lib/market/color-family';
import { findCatalogEntry, type CatalogEntryRow } from '@/lib/market/shoe-id/catalog';
import {
  legacyColorwaysToProfiles,
  matchColorwayProfile,
  parseColorwayProfiles,
} from '@/lib/market/shoe-id/colorway-profiles';
import { normalizeMarketRarity, type MarketRarity } from '@/lib/market/rarity';
import { parseModelYearHint } from '@/lib/market/parse-model-year';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';

export type ListingEnrichment = {
  brand?: string;
  model?: string;
  colorway?: string;
  color_family?: string;
  model_year?: number | null;
  weight_class?: string | null;
  rarity?: MarketRarity | null;
  collector_notes?: string | null;
  upper_material?: string | null;
  sole_description?: string | null;
};

/** Best catalog colorway name for a hint from vision / seller input. */
export function resolveCatalogColorway(
  entry: CatalogEntryRow,
  colorwayHint?: string | null
): string | null {
  const profiles = parseColorwayProfiles(entry.colorway_profiles);
  const legacy = legacyColorwaysToProfiles(entry.colorways);
  const all = profiles.length ? profiles : legacy;

  if (colorwayHint?.trim()) {
    const matched = matchColorwayProfile(all, colorwayHint);
    if (matched) return matched.name;
    return colorwayHint.trim();
  }

  if (all.length === 1) return all[0].name;
  return null;
}

export function enrichmentFromCatalog(
  entry: CatalogEntryRow,
  colorwayHint?: string | null
): ListingEnrichment {
  const rarity = normalizeMarketRarity(entry.rarity ?? null);
  const modelYear = parseModelYearHint(null, entry.years_produced ?? null);
  const weight = entry.weight?.trim() || null;
  const colorway = resolveCatalogColorway(entry, colorwayHint);
  return {
    model_year: modelYear,
    weight_class: weight,
    rarity,
    collector_notes: entry.collector_notes?.trim() || null,
    colorway: colorway || undefined,
    color_family: colorway ? inferColorFamilyFromColorway(colorway) || undefined : undefined,
    upper_material: entry.upper_material?.trim() || null,
    sole_description: entry.sole_description?.trim() || null,
  };
}

export function enrichmentFromShoeIdResult(
  result: ShoeIdResult,
  colorFamily?: string
): ListingEnrichment {
  const modelYear = parseModelYearHint(result.era, null);
  return {
    brand: result.brand,
    model: result.model,
    colorway: result.colorway?.trim() || undefined,
    color_family: colorFamily || undefined,
    model_year: modelYear,
    rarity: normalizeMarketRarity(result.rarity) ?? undefined,
    collector_notes: result.collector_notes?.trim() || null,
  };
}

export async function fetchCatalogListingEnrichment(
  supabase: SupabaseClient,
  brand: string,
  model: string,
  colorwayHint?: string | null
): Promise<ListingEnrichment | null> {
  const entry = await findCatalogEntry(supabase, brand, model);
  if (!entry) return null;
  return enrichmentFromCatalog(entry as CatalogEntryRow, colorwayHint);
}
