import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import { CatalogEntrySchema } from '@/lib/market/shoe-id/schemas';

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    resultId?: string;
    wasCorrect?: boolean;
    catalog?: unknown;
    referenceImageUrls?: string[];
    verifiedBy?: string;
  };

  if (!body.resultId) {
    return NextResponse.json({ error: 'resultId required' }, { status: 400 });
  }

  const parsed = CatalogEntrySchema.safeParse(body.catalog);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid catalog entry' }, { status: 400 });
  }

  const admin = createAdminClient(auth.tenantSlug);
  const entry = parsed.data;
  const verifiedBy = body.verifiedBy?.trim() || 'Matt Hickey';
  const referenceImageUrls = (body.referenceImageUrls ?? [])
    .filter((u) => typeof u === 'string' && u.startsWith('http'))
    .slice(0, 6);

  const { data: catalogRow, error: catalogErr } = await admin
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
      reference_image_urls: referenceImageUrls.length ? referenceImageUrls : entry.reference_image_urls ?? [],
      sale_comps: entry.sale_comps ?? [],
      source: body.wasCorrect ? 'handbook' : 'manual',
      verified: true,
      verified_by: verifiedBy,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (catalogErr || !catalogRow) {
    return NextResponse.json({ error: catalogErr?.message ?? 'Failed to save catalog' }, { status: 500 });
  }

  await admin
    .from('shoe_id_results')
    .update({
      confirmed: true,
      confirmed_model_id: catalogRow.id,
      confirmed_by: auth.userId,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', body.resultId);

  return NextResponse.json({ catalogId: catalogRow.id });
}
