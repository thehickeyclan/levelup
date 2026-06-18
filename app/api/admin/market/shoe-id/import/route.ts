import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import { CatalogEntrySchema } from '@/lib/market/shoe-id/schemas';

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected JSON array of catalog entries' }, { status: 400 });
  }

  const admin = createAdminClient(auth.tenantSlug);
  const rows = [];

  for (const item of body) {
    const parsed = CatalogEntrySchema.safeParse(item);
    if (!parsed.success) continue;
    const e = parsed.data;
    rows.push({
      brand: e.brand,
      model: e.model,
      model_aliases: e.model_aliases ?? [],
      years_produced: e.years_produced ?? null,
      colorways: e.colorways ?? [],
      visual_identifiers: e.visual_identifiers ?? [],
      sole_description: e.sole_description ?? null,
      upper_material: e.upper_material ?? null,
      logo_placement: e.logo_placement ?? null,
      rarity: e.rarity,
      value_low_cents: e.value_low_cents ?? null,
      value_mid_cents: e.value_mid_cents ?? null,
      value_high_cents: e.value_high_cents ?? null,
      collector_notes: e.collector_notes ?? null,
      source: e.source ?? 'import',
      verified: e.verified ?? false,
      verified_by: e.verified_by ?? null,
    });
  }

  if (!rows.length) {
    return NextResponse.json({ error: 'No valid entries to import' }, { status: 400 });
  }

  const { data, error } = await admin.from('wrestling_shoes_catalog').insert(rows).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ imported: data?.length ?? 0 });
}
