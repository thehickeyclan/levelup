import type { SupabaseClient } from '@supabase/supabase-js';
import type { SaleComp } from '@/lib/market/shoe-id/schemas';

const CATALOG_SELECT =
  'brand,model,model_aliases,years_produced,colorways,visual_identifiers,sole_description,upper_material,logo_placement,rarity,value_low_cents,value_mid_cents,value_high_cents,collector_notes,reference_image_urls,sale_comps';

const FULL_CATALOG_LIMIT = 200;

export type CatalogEntryRow = {
  brand: string;
  model: string;
  model_aliases?: string[] | null;
  years_produced?: string | null;
  colorways?: unknown[] | null;
  visual_identifiers?: string[] | null;
  sole_description?: string | null;
  upper_material?: string | null;
  logo_placement?: string | null;
  rarity?: string | null;
  value_low_cents?: number | null;
  value_mid_cents?: number | null;
  value_high_cents?: number | null;
  collector_notes?: string | null;
  reference_image_urls?: string[] | null;
  sale_comps?: SaleComp[] | null;
};

function formatSaleComps(comps: SaleComp[] | null | undefined): string {
  if (!comps?.length) return '—';
  return comps
    .map((c) => {
      const price = `$${Math.round(c.sold_price_cents / 100)}`;
      const condition = c.condition ? `, ${c.condition}` : '';
      const source = c.source ? ` (${c.source})` : '';
      const notes = c.notes ? `: ${c.notes}` : '';
      const photos = c.image_urls?.length ? ' [photos on file]' : '';
      return `${price}${condition}${source}${notes}${photos}`;
    })
    .join('; ');
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
COLORWAYS: ${JSON.stringify(entry.colorways ?? [])}
RARITY: ${entry.rarity ?? '—'}
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
