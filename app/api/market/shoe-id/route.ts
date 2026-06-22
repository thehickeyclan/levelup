import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage, isAiRateLimitBypass, aiLimitReachedMessage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude, ANTHROPIC_MODEL } from '@/lib/market/ai/client';
import { findCatalogEntry, matchCatalogEntry, getCatalogContext, fetchCatalogEntries } from '@/lib/market/shoe-id/catalog';
import { enrichmentFromCatalog } from '@/lib/market/catalog-listing-enrich';
import { buildShoeIdVisionContent } from '@/lib/market/shoe-id/images';
import { listingQueryImageBlocks } from '@/lib/market/shoe-id/load-query-images';
import { SHOE_ID_SYSTEM_PROMPT, shoeIdUserMessage } from '@/lib/market/shoe-id/prompts';
import { ShoeIdResultSchema } from '@/lib/market/shoe-id/schemas';
import { shoeIdServerEnabled } from '@/lib/market/shoe-id/feature-flag';
import { normalizeMarketBrand } from '@/lib/market/brands';
import {
  dominantSellerListing,
  fetchSellerShoeHints,
  formatSellerShoeHintsForPrompt,
} from '@/lib/market/seller-shoe-hints';

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user, role } = ctx;

  const isAdmin = role === 'admin';
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (!shoeIdServerEnabled() && !isAdmin && !anthropicConfigured) {
    return NextResponse.json({ error: 'Shoe identification is not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    images?: string[];
    listingId?: string;
    brandHint?: string;
    modelHint?: string;
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
  const usage = await checkAndIncrementAiUsage(admin, user!.id, {
    bypass: isAiRateLimitBypass(role),
  });
  if (!usage.allowed) {
    return NextResponse.json(
      { error: aiLimitReachedMessage(usage.count, usage.limit), remaining: 0 },
      { status: 429 }
    );
  }

  const sellerHints = await fetchSellerShoeHints(supabase, user!.id);
  const sellerContext = formatSellerShoeHintsForPrompt(sellerHints);
  const dominantListing = dominantSellerListing(sellerHints);

  /** Only user-typed brand/model bias catalog + reference photos — never seller history. */
  const brandHint = body.brandHint?.trim() || undefined;
  const modelHint = body.modelHint?.trim() || undefined;

  const catalogContext = await getCatalogContext(supabase, brandHint);
  const catalogEntries = await fetchCatalogEntries(supabase, brandHint);

  let queryBlocks: Awaited<ReturnType<typeof listingQueryImageBlocks>> | undefined;
  if (listingId) {
    const { data: listingImages } = await supabase
      .from('market_listing_images')
      .select('storage_path, public_url')
      .eq('listing_id', listingId)
      .order('display_order', { ascending: true })
      .limit(6);
    if (listingImages?.length) {
      queryBlocks = await listingQueryImageBlocks(admin, listingImages);
    }
  }

  const { blocks, queryImageCount, referenceImageCount } = buildShoeIdVisionContent(
    images,
    catalogEntries,
    { brandHint, modelHint, queryBlocks }
  );
  if (!queryImageCount) {
    return NextResponse.json({ error: 'Could not load photos for analysis.' }, { status: 400 });
  }

  const claude = await callClaude(
    SHOE_ID_SYSTEM_PROMPT(catalogContext + sellerContext),
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
  const catalogRow = await findCatalogEntry(admin, parsed.brand, parsed.model);
  const catalogEnrichment = catalogRow ? enrichmentFromCatalog(catalogRow) : null;

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
    catalogEnrichment,
    remaining: usage.remaining,
    sellerDominantBrand: dominantListing?.brand ?? null,
    sellerDominantListing: dominantListing,
    autoApplyRecommended:
      !brandHint ||
      normalizeMarketBrand(parsed.brand) === normalizeMarketBrand(brandHint) ||
      parsed.confidence >= 0.55,
  });
}
