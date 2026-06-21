import type { SupabaseClient } from '@supabase/supabase-js';
import { findCatalogEntry, type CatalogEntryRow } from '@/lib/market/shoe-id/catalog';
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
};

export function enrichmentFromCatalog(entry: CatalogEntryRow): ListingEnrichment {
  const rarity = normalizeMarketRarity(entry.rarity ?? null);
  const modelYear = parseModelYearHint(null, entry.years_produced ?? null);
  const weight = entry.weight?.trim() || null;
  return {
    model_year: modelYear,
    weight_class: weight,
    rarity,
    collector_notes: entry.collector_notes?.trim() || null,
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
  model: string
): Promise<ListingEnrichment | null> {
  const entry = await findCatalogEntry(supabase, brand, model);
  if (!entry) return null;
  return enrichmentFromCatalog(entry as CatalogEntryRow);
}
