import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import { callClaude, extractJsonFromClaude } from '@/lib/market/ai/client';
import { findCatalogEntry, getCatalogContext, fetchCatalogEntries } from '@/lib/market/shoe-id/catalog';
import { buildShoeIdVisionContent } from '@/lib/market/shoe-id/images';
import {
  SHOE_ID_CORRECTION_SYSTEM_PROMPT,
  shoeCorrectionUserMessage,
} from '@/lib/market/shoe-id/prompts';
import { ShoeIdResultSchema } from '@/lib/market/shoe-id/schemas';

function catalogToEnrichment(
  entry: Record<string, unknown>,
  colorwayHint?: string
) {
  const colorways = Array.isArray(entry.colorways)
    ? entry.colorways.map((c) => (typeof c === 'string' ? c : String(c))).filter(Boolean)
    : [];
  const colorwayList = colorwayHint
    ? [colorwayHint, ...colorways.filter((c) => c !== colorwayHint)]
    : colorways;
  return {
    model_aliases: (entry.model_aliases as string[] | null) ?? [],
    era: (entry.years_produced as string | null) ?? '',
    colorway: colorwayList[0] ?? '',
    colorways: colorwayList,
    rarity: (entry.rarity as string) ?? 'common',
    visual_matches: (entry.visual_identifiers as string[] | null) ?? [],
    sole_description: (entry.sole_description as string | null) ?? '',
    upper_material: (entry.upper_material as string | null) ?? '',
    logo_placement: (entry.logo_placement as string | null) ?? '',
    value_low_cents: (entry.value_low_cents as number | null) ?? 0,
    value_mid_cents: (entry.value_mid_cents as number | null) ?? 0,
    value_high_cents: (entry.value_high_cents as number | null) ?? 0,
    collector_notes: (entry.collector_notes as string | null) ?? '',
    catalog_matched: true,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    images?: string[];
    brand?: string;
    model?: string;
    colorway?: string;
    wrongBrand?: string;
    wrongModel?: string;
    resultId?: string;
  };

  const brand = body.brand?.trim() ?? '';
  const model = body.model?.trim() ?? '';
  const colorway = body.colorway?.trim();
  const images = (body.images ?? []).filter((u) => typeof u === 'string' && u.startsWith('http'));

  if (!brand || !model) {
    return NextResponse.json({ error: 'Brand and model required' }, { status: 400 });
  }
  if (!images.length) {
    return NextResponse.json({ error: 'At least one image URL required' }, { status: 400 });
  }

  const admin = createAdminClient(auth.tenantSlug);
  const catalogEntry = await findCatalogEntry(admin, brand, model);

  if (catalogEntry) {
    const enrichment = catalogToEnrichment(catalogEntry, colorway);
    return NextResponse.json({
      source: 'catalog',
      brand,
      model,
      enrichment,
    });
  }

  const catalogContext = await getCatalogContext(admin, brand);
  const catalogEntries = await fetchCatalogEntries(admin, brand);
  const { blocks, queryImageCount } = await buildShoeIdVisionContent(images, catalogEntries, {
    brandHint: brand,
  });
  if (!queryImageCount) {
    return NextResponse.json({ error: 'Could not load photos for analysis.' }, { status: 400 });
  }

  const claude = await callClaude(
    SHOE_ID_CORRECTION_SYSTEM_PROMPT(catalogContext),
    [
      ...blocks,
      {
        type: 'text',
        text: shoeCorrectionUserMessage({
          imageCount: queryImageCount,
          brand,
          model,
          colorway,
          wrongBrand: body.wrongBrand?.trim(),
          wrongModel: body.wrongModel?.trim(),
        }),
      },
    ],
    2048
  );

  if (!claude.ok) {
    const detail =
      claude.reason === 'missing_key'
        ? 'ANTHROPIC_API_KEY is not set.'
        : claude.reason === 'api_error' && claude.detail === '413'
          ? 'Request too large for AI — use fewer photos or re-upload (images are compressed on upload).'
          : 'Could not generate details — try again.';
    return NextResponse.json({ error: detail }, { status: 503 });
  }

  let parsed = null;
  try {
    parsed = ShoeIdResultSchema.parse(JSON.parse(extractJsonFromClaude(claude.result.text)));
  } catch (e) {
    console.error('shoe-id correct parse:', e, claude.result.text);
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 503 });
  }

  const enrichment = {
    model_aliases: parsed.model_aliases,
    era: parsed.era,
    colorway: colorway || parsed.colorway,
    colorways: colorway ? [colorway, parsed.colorway].filter(Boolean) : [parsed.colorway],
    rarity: parsed.rarity,
    visual_matches: parsed.visual_matches,
    sole_description: '',
    upper_material: '',
    logo_placement: '',
    value_low_cents: parsed.value_low_cents,
    value_mid_cents: parsed.value_mid_cents,
    value_high_cents: parsed.value_high_cents,
    collector_notes: parsed.collector_notes,
    catalog_matched: parsed.catalog_matched,
    confidence: parsed.confidence,
    confidence_note: parsed.confidence_note,
  };

  if (body.resultId) {
    void admin
      .from('shoe_id_results')
      .update({
        identified_brand: brand,
        identified_model: model,
        identified_era: enrichment.era,
        identified_colorway: enrichment.colorway,
        identified_rarity: enrichment.rarity,
        value_low_cents: enrichment.value_low_cents,
        value_mid_cents: enrichment.value_mid_cents,
        value_high_cents: enrichment.value_high_cents,
        raw_response: { ...parsed, brand, model, colorway: enrichment.colorway },
      })
      .eq('id', body.resultId);
  }

  return NextResponse.json({
    source: 'ai',
    brand,
    model,
    enrichment,
  });
}
