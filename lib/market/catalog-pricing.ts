import type { SupabaseClient } from '@supabase/supabase-js';
import type { ColorwayProfile, SaleComp } from '@/lib/market/shoe-id/schemas';
import { findCatalogEntry } from '@/lib/market/shoe-id/catalog';
import {
  filterSaleCompsForPricing,
  formatColorwayProfilesForContext,
  formatSaleCompsDetailed,
  matchColorwayProfile,
  parseColorwayProfiles,
} from '@/lib/market/shoe-id/colorway-profiles';
import { sizePriceMultiplier } from '@/lib/market/price-heuristics';

export type CatalogPricingContext = {
  catalogMatched: boolean;
  colorwayProfile: ColorwayProfile | null;
  relevantSaleComps: SaleComp[];
  /** Every stored comp on the model — card counts must equal this, not the filtered slice. */
  allSaleComps: SaleComp[];
  /** Live manufacturer price when the model is still in production (catalog_price_cents + price_source). */
  currentRetail: { cents: number; source: string | null } | null;
  sizeMultiplier: number;
  promptLines: string[];
};

export async function buildCatalogPricingContext(
  supabase: SupabaseClient,
  brand: string,
  model: string,
  colorway?: string | null,
  sizeUs?: number | null
): Promise<CatalogPricingContext> {
  const sizeMultiplier = sizePriceMultiplier(sizeUs);
  const entry = await findCatalogEntry(supabase, brand, model);

  if (!entry) {
    return {
      catalogMatched: false,
      colorwayProfile: null,
      relevantSaleComps: [],
      allSaleComps: [],
      currentRetail: null,
      sizeMultiplier,
      promptLines: [
        'No catalog match for this brand/model.',
        `Size multiplier for pricing: ${sizeMultiplier.toFixed(2)}x (peak demand ~9–11.5 US).`,
      ],
    };
  }

  const profiles = parseColorwayProfiles(entry.colorway_profiles);
  const colorwayProfile = matchColorwayProfile(profiles, colorway);
  const allComps = (entry.sale_comps ?? []) as SaleComp[];
  const relevantSaleComps = filterSaleCompsForPricing(allComps, colorway, sizeUs);

  const promptLines: string[] = [
    `Catalog match: ${entry.brand} ${entry.model}.`,
    `Model value range: $${Math.round((entry.value_low_cents as number || 0) / 100)}–$${Math.round((entry.value_high_cents as number || 0) / 100)}.`,
    `Colorway profiles: ${formatColorwayProfilesForContext(profiles)}`,
  ];

  if (colorway?.trim()) {
    promptLines.push(`Listing colorway: ${colorway.trim()}.`);
  }

  if (colorwayProfile) {
    promptLines.push(
      `Matched colorway profile: ${colorwayProfile.name} (${colorwayProfile.availability}${colorwayProfile.value_tier ? `, tier ${colorwayProfile.value_tier}` : ''}).`
    );
    if (colorwayProfile.retail_anchor_cents) {
      promptLines.push(
        `Current/retail anchor for this colorway: $${(colorwayProfile.retail_anchor_cents / 100).toFixed(0)} — commodity colorways stay near retail; discontinued/grail colorways can far exceed it.`
      );
    }
    if (colorwayProfile.value_mid_cents != null) {
      promptLines.push(
        `Catalog collector mid for this colorway: $${Math.round(colorwayProfile.value_mid_cents / 100)}.`
      );
    }
    if (colorwayProfile.notes) {
      promptLines.push(`Colorway notes: ${colorwayProfile.notes}`);
    }
  } else if (colorway?.trim()) {
    promptLines.push(
      'No exact catalog colorway profile — use model range but adjust if this is a known premium or retail colorway.'
    );
  }

  if (relevantSaleComps.length) {
    promptLines.push(`Relevant documented sales: ${formatSaleCompsDetailed(relevantSaleComps)}`);
  } else if (allComps.length) {
    promptLines.push(`Other documented sales (other colorways/sizes): ${formatSaleCompsDetailed(allComps.slice(0, 5))}`);
  }

  promptLines.push(
    `Size ${sizeUs ?? 'unknown'} US → apply ${sizeMultiplier.toFixed(2)}x multiplier vs peak sizes (9–11.5). Sizes under 9 and above 12 sell for less; 13+ much less.`
  );

  const retailCents = entry.catalog_price_cents as number | null;
  const currentRetail =
    retailCents != null && retailCents > 0
      ? { cents: retailCents, source: (entry.price_source as string | null) ?? null }
      : null;
  if (currentRetail) {
    promptLines.push(
      `Still in production: current manufacturer price $${Math.round(currentRetail.cents / 100)}${currentRetail.source ? ` (${currentRetail.source})` : ''} — a new pair of a standard colorway cannot be worth more than the live retail price.`
    );
  }

  return {
    catalogMatched: true,
    colorwayProfile,
    relevantSaleComps,
    allSaleComps: allComps,
    currentRetail,
    sizeMultiplier,
    promptLines,
  };
}
