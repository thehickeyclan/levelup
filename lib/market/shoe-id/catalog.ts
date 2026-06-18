import type { SupabaseClient } from '@supabase/supabase-js';

const CATALOG_SELECT =
  'brand,model,model_aliases,years_produced,colorways,visual_identifiers,sole_description,upper_material,logo_placement,rarity,value_low_cents,value_mid_cents,value_high_cents,collector_notes';

const FULL_CATALOG_LIMIT = 200;

export async function getCatalogContext(
  supabase: SupabaseClient,
  brandHint?: string
): Promise<string> {
  const { count } = await supabase
    .from('wrestling_shoes_catalog')
    .select('id', { count: 'exact', head: true });

  const total = count ?? 0;

  let query = supabase.from('wrestling_shoes_catalog').select(CATALOG_SELECT).order('brand');

  if (total >= FULL_CATALOG_LIMIT && brandHint?.trim()) {
    query = query.ilike('brand', `%${brandHint.trim()}%`);
  }

  const { data } = await query.limit(FULL_CATALOG_LIMIT);
  if (!data?.length) return 'No catalog data available — use general knowledge.';

  return (
    `WRESTLING SHOE CATALOG (${data.length} entries):\n\n` +
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
VALUE: $${Math.round((entry.value_low_cents || 0) / 100)}–$${Math.round((entry.value_high_cents || 0) / 100)}
NOTES: ${entry.collector_notes ?? '—'}
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
  const { data } = await supabase
    .from('wrestling_shoes_catalog')
    .select('id')
    .ilike('brand', brand.trim())
    .ilike('model', `%${model.trim()}%`)
    .limit(1)
    .maybeSingle();

  return (data?.id as string) ?? null;
}
