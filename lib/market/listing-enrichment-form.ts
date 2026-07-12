import { inferColorFamilyFromColorway } from '@/lib/market/color-family';
import { normalizeMarketBrand } from '@/lib/market/brands';
import type { ListingEnrichment } from '@/lib/market/catalog-listing-enrich';
import type { MarketRarity } from '@/lib/market/rarity';
import { USED_CONDITIONS, type MarketWearState } from '@/lib/market/wear-state';

export type ListingEnrichmentFormFields = {
  brand: string;
  model: string;
  colorway: string;
  color_family: string;
  model_year: string;
  rarity: MarketRarity | '';
  weight_class: string;
};

/** Map catalog / shoe-ID enrichment onto listing form fields. */
export function enrichmentToFormPatch(
  enrichment: ListingEnrichment,
  current: ListingEnrichmentFormFields,
  opts?: { colorwayOnly?: boolean; fillEmptyOnly?: boolean }
): Partial<ListingEnrichmentFormFields> {
  const patch: Partial<ListingEnrichmentFormFields> = {};
  const fillEmpty = opts?.fillEmptyOnly ?? false;

  if (!opts?.colorwayOnly) {
    if (enrichment.brand && (!fillEmpty || !current.brand.trim())) {
      patch.brand = normalizeMarketBrand(enrichment.brand);
    }
    if (enrichment.model && (!fillEmpty || !current.model.trim())) {
      patch.model = enrichment.model.trim();
    }
    if (
      enrichment.model_year != null &&
      enrichment.model_year > 0 &&
      (!fillEmpty || !current.model_year)
    ) {
      patch.model_year = String(enrichment.model_year);
    }
    if (enrichment.weight_class && (!fillEmpty || !current.weight_class.trim())) {
      patch.weight_class = enrichment.weight_class;
    }
    if (enrichment.rarity && (!fillEmpty || !current.rarity)) {
      patch.rarity = enrichment.rarity;
    }
  }

  const cw = enrichment.colorway?.trim() || '';
  if (cw && (!fillEmpty || !current.colorway.trim())) {
    patch.colorway = cw;
    patch.color_family = inferColorFamilyFromColorway(cw) || current.color_family;
  } else if (
    enrichment.color_family &&
    (!fillEmpty || !current.color_family.trim())
  ) {
    patch.color_family = enrichment.color_family;
  }

  return patch;
}

export function conditionGradeFromAnalysis(
  wearState: MarketWearState,
  grade: string | undefined
): string | null {
  if (wearState !== 'used' || !grade) return null;
  if (!(USED_CONDITIONS as readonly string[]).includes(grade)) return null;
  return grade;
}
