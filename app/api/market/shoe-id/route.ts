import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude, ANTHROPIC_MODEL } from '@/lib/market/ai/client';
import { getCatalogContext, matchCatalogEntry, fetchCatalogEntries } from '@/lib/market/shoe-id/catalog';
import { buildShoeIdVisionContent } from '@/lib/market/shoe-id/images';
import { SHOE_ID_SYSTEM_PROMPT, shoeIdUserMessage } from '@/lib/market/shoe-id/prompts';
import { ShoeIdResultSchema } from '@/lib/market/shoe-id/schemas';
import { shoeIdServerEnabled } from '@/lib/market/shoe-id/feature-flag';

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user, role } = ctx;

  const isAdmin = role === 'admin';
  if (!shoeIdServerEnabled() && !isAdmin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    images?: string[];
    listingId?: string;
    brandHint?: string;
  };

  const images = (body.images ?? []).filter((u) => typeof u === 'string' && u.startsWith('http'));
  if (!images.length) {
    return NextResponse.json({ error: 'At least one image URL required' }, { status: 400 });
  }
  if (images.length > 6) {
    return NextResponse.json({ error: 'Maximum 6 images' }, { status: 400 });
  }

  const listingId = body.listingId?.trim();
  if (listingId) {
    const { data: listing } = await supabase
      .from('market_listings')
      .select('seller_id')
      .eq('id', listingId)
      .single();
    if (!listing || listing.seller_id !== user!.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const admin = createAdminClient(tenant.slug);
  const usage = await checkAndIncrementAiUsage(admin, user!.id);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: 'AI limit reached. Try again in an hour.', remaining: 0 },
      { status: 429 }
    );
  }

  const catalogContext = await getCatalogContext(supabase, body.brandHint);
  const catalogEntries = await fetchCatalogEntries(supabase, body.brandHint);
  const { blocks, queryImageCount, referenceImageCount } = await buildShoeIdVisionContent(
    images,
    catalogEntries,
    { brandHint: body.brandHint }
  );
  if (!queryImageCount) {
    return NextResponse.json({ error: 'Could not load photos for analysis.' }, { status: 400 });
  }

  const claude = await callClaude(
    SHOE_ID_SYSTEM_PROMPT(catalogContext),
    [...blocks, { type: 'text', text: shoeIdUserMessage(queryImageCount, referenceImageCount) }],
    2048
  );

  let parsed = null;
  if (claude.ok) {
    try {
      parsed = ShoeIdResultSchema.parse(JSON.parse(extractJsonFromClaude(claude.result.text)));
    } catch (e) {
      console.error('shoe-id parse:', e, claude.ok ? claude.result.text : '');
    }
  }

  if (!parsed) {
    const detail =
      !claude.ok && claude.reason === 'missing_key'
        ? 'ANTHROPIC_API_KEY is not set.'
        : !claude.ok && claude.reason === 'api_error' && claude.detail === '413'
          ? 'Request too large for AI — use fewer photos or re-upload (images are compressed on upload).'
          : 'Shoe identification unavailable — try again.';
    return NextResponse.json({ error: detail }, { status: 503 });
  }

  const catalogMatchId = await matchCatalogEntry(admin, parsed.brand, parsed.model);

  const { data: resultRow, error: insertErr } = await admin
    .from('shoe_id_results')
    .insert({
      user_id: user!.id,
      listing_id: listingId ?? null,
      catalog_match_id: catalogMatchId,
      images_analyzed: queryImageCount,
      identified_brand: parsed.brand,
      identified_model: parsed.model,
      identified_era: parsed.era,
      identified_colorway: parsed.colorway,
      identified_rarity: parsed.rarity,
      value_low_cents: parsed.value_low_cents,
      value_mid_cents: parsed.value_mid_cents,
      value_high_cents: parsed.value_high_cents,
      confidence: parsed.confidence,
      raw_response: parsed,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('shoe_id_results insert:', insertErr);
  }

  const tokens = claude.ok ? claude.result : { tokensIn: 0, tokensOut: 0 };
  void admin.from('market_ai_logs').insert({
    user_id: user!.id,
    listing_id: listingId ?? null,
    route: 'shoe-id',
    model_used: ANTHROPIC_MODEL,
    tokens_in: tokens.tokensIn ?? 0,
    tokens_out: tokens.tokensOut ?? 0,
    cost_estimate_cents: 2,
  });

  return NextResponse.json({
    result: parsed,
    resultId: resultRow?.id ?? null,
    catalogMatchId,
    remaining: usage.remaining,
  });
}
