import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import { CatalogEntrySchema } from '@/lib/market/shoe-id/schemas';

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient(auth.tenantSlug);
  const { data, error } = await admin
    .from('wrestling_shoes_catalog')
    .select('*')
    .order('brand')
    .order('model');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CatalogEntrySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.')}: ${issue.message}` : 'validation failed';
    return NextResponse.json({ error: `Invalid catalog entry — ${detail}` }, { status: 400 });
  }

  const admin = createAdminClient(auth.tenantSlug);
  const entry = parsed.data;

  const { data, error } = await admin
    .from('wrestling_shoes_catalog')
    .insert({
      brand: entry.brand,
      model: entry.model,
      model_aliases: entry.model_aliases ?? [],
      years_produced: entry.years_produced ?? null,
      colorways: entry.colorways ?? [],
      visual_identifiers: entry.visual_identifiers ?? [],
      sole_description: entry.sole_description ?? null,
      upper_material: entry.upper_material ?? null,
      logo_placement: entry.logo_placement ?? null,
      rarity: entry.rarity,
      value_low_cents: entry.value_low_cents ?? null,
      value_mid_cents: entry.value_mid_cents ?? null,
      value_high_cents: entry.value_high_cents ?? null,
      collector_notes: entry.collector_notes ?? null,
      reference_image_urls: entry.reference_image_urls ?? [],
      sale_comps: entry.sale_comps ?? [],
      source: entry.source ?? 'manual',
      verified: entry.verified ?? false,
      verified_by: entry.verified_by ?? null,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    const msg = error.message;
    const hint =
      /reference_image_urls|sale_comps|column/i.test(msg)
        ? `${msg} — apply wrestling_shoes_catalog migrations on Supabase`
        : msg;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}
