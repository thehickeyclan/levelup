import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaleComp } from '@/lib/market/shoe-id/schemas';
import {
  formatColorwayProfilesForContext,
  formatSaleCompsDetailed,
  parseColorwayProfiles,
} from '@/lib/market/shoe-id/colorway-profiles';

const CATALOG_SELECT =
  'brand,model,model_aliases,years_produced,colorways,colorway_profiles,visual_identifiers,sole_description,upper_material,logo_placement,rarity,value_low_cents,value_mid_cents,value_high_cents,original_msrp_cents,catalog_price_cents,price_source,inflation_adjusted_price,collector_notes,reference_image_urls,sale_comps';

const FULL_CATALOG_LIMIT = 200;

export type CatalogEntryRow = {
  brand: string;
  model: string;
  model_aliases?: string[] | null;
  years_produced?: string | null;
  colorways?: unknown[] | null;
  colorway_profiles?: unknown[] | null;
  visual_identifiers?: string[] | null;
  sole_description?: string | null;
  upper_material?: string | null;
  logo_placement?: string | null;
  rarity?: string | null;
  value_low_cents?: number | null;
  value_mid_cents?: number | null;
  value_high_cents?: number | null;
  original_msrp_cents?: number | null;
  catalog_price_cents?: number | null;
  price_source?: string | null;
  inflation_adjusted_price?: string | null;
  collector_notes?: string | null;
  reference_image_urls?: string[] | null;
  sale_comps?: SaleComp[] | null;
};

function formatLaunchPricing(entry: CatalogEntryRow): string {
  const msrp = entry.original_msrp_cents
    ? `$${(entry.original_msrp_cents / 100).toFixed(2)} MSRP`
    : null;
  const catalog = entry.catalog_price_cents
    ? `$${(entry.catalog_price_cents / 100).toFixed(2)} catalog`
    : null;
  const source = entry.price_source ? ` (${entry.price_source})` : '';
  const inflation = entry.inflation_adjusted_price
    ? `; inflation-adjusted ~${entry.inflation_adjusted_price}`
    : '';
  const parts = [msrp, catalog].filter(Boolean);
  if (!parts.length) return '—';
  return `${parts.join(', ')}${source}${inflation}`;
}

function formatAppreciationMultiple(entry: CatalogEntryRow): string {
  if (!entry.original_msrp_cents || !entry.value_mid_cents) return '';
  const multiple = entry.value_mid_cents / entry.original_msrp_cents;
  return ` (${multiple.toFixed(1)}x vs launch MSRP)`;
}

function formatSaleComps(comps: SaleComp[] | null | undefined): string {
  return formatSaleCompsDetailed(comps);
}

export async function fetchCatalogEntries(
  supabase: SupabaseClient,
  brandHint?: string
): Promise<CatalogEntryRow[]> {
  const { count } = await supabase
    .from('wrestling_shoes_catalog')
    .select('id', { count: 'exact', head: true });

  const total = count ?? 0;

  let query = supabase.from('wrestling_shoes_catalog').select(CATALOG_SELECT).order('brand');

  if (total >= FULL_CATALOG_LIMIT && brandHint?.trim()) {
    query = query.ilike('brand', `%${brandHint.trim()}%`);
  }

  const { data } = await query.limit(FULL_CATALOG_LIMIT);
  return (data ?? []) as CatalogEntryRow[];
}

export async function getCatalogContext(
  supabase: SupabaseClient,
  brandHint?: string
): Promise<string> {
  const data = await fetchCatalogEntries(supabase, brandHint);
  if (!data.length) return 'No catalog data available — use general knowledge.';

  const withRefs = data.filter((e) => e.reference_image_urls?.length).length;

  return (
    `WRESTLING SHOE CATALOG (${data.length} entries${withRefs ? `, ${withRefs} with confirmed reference photos` : ''}):\n\n` +
    data
      .map(
        (entry) => `
BRAND: ${entry.brand}
MODEL: ${entry.model}${entry.model_aliases?.length ? ` (also known as: ${entry.model_aliases.join(', ')})` : ''}
YEARS: ${entry.years_produced ?? '—'}
VISUAL IDENTIFIERS: ${entry.visual_identifiers?.join('; ') ?? '—'}
SOLE: ${entry.sole_description ?? '—'}
UPPER: ${entry.upper_material ?? '—'}
LOGO: ${entry.logo_placement ?? '—'}
COLORWAYS: ${formatColorwayProfilesForContext(parseColorwayProfiles(entry.colorway_profiles)) || JSON.stringify(entry.colorways ?? [])}
RARITY: ${entry.rarity ?? '—'}
LAUNCH PRICING: ${formatLaunchPricing(entry)}${formatAppreciationMultiple(entry)}
VALUE RANGE: $${Math.round((entry.value_low_cents || 0) / 100)}–$${Math.round((entry.value_high_cents || 0) / 100)}
DOCUMENTED SALES: ${formatSaleComps(entry.sale_comps)}
NOTES: ${entry.collector_notes ?? '—'}${entry.reference_image_urls?.length ? `\nREFERENCE PHOTOS: ${entry.reference_image_urls.length} admin-confirmed training angles included in this request` : ''}
---`
      )
      .join('\n')
  );
}

export async function matchCatalogEntry(
  supabase: SupabaseClient,
  brand: string,
  model: string
): Promise<string | null> {
  const entry = await findCatalogEntry(supabase, brand, model);
  return (entry?.id as string) ?? null;
}

export async function findCatalogEntry(
  supabase: SupabaseClient,
  brand: string,
  model: string
) {
  const brandTrim = brand.trim();
  const modelTrim = model.trim();
  if (!brandTrim || !modelTrim) return null;

  const { data: exact } = await supabase
    .from('wrestling_shoes_catalog')
    .select('*')
    .ilike('brand', brandTrim)
    .ilike('model', modelTrim)
    .limit(1)
    .maybeSingle();

  if (exact) return exact;

  const { data: fuzzy } = await supabase
    .from('wrestling_shoes_catalog')
    .select('*')
    .ilike('brand', brandTrim)
    .ilike('model', `%${modelTrim}%`)
    .limit(1)
    .maybeSingle();

  return fuzzy ?? null;
}
