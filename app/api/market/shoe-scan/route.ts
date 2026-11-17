import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage, isAiRateLimitBypass, aiLimitReachedMessage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude, ANTHROPIC_MODEL, type ClaudeMessageContent } from '@/lib/market/ai/client';
import { getCatalogContext, fetchCatalogEntries, findCatalogEntryWithAliases, type CatalogEntryRow } from '@/lib/market/shoe-id/catalog';
import { enrichmentFromCatalog } from '@/lib/market/catalog-listing-enrich';
import { buildShoeIdVisionContent } from '@/lib/market/shoe-id/images';
import { SHOE_ID_SYSTEM_PROMPT, shoeIdUserMessage } from '@/lib/market/shoe-id/prompts';
import { ShoeIdResultSchema } from '@/lib/market/shoe-id/schemas';
import { fetchMarketValueData } from '@/lib/market/market-value';
import { getIgPriceHistory } from '@/lib/market/ig-price-history';

/**
 * The free front door: snap photos of any pair, learn what it is and what
 * it's worth — no listing, no upload to storage, nothing published. Photos
 * come up as base64, go straight into the vision call, and are not kept.
 *
 * The identity machinery is the same as /api/market/shoe-id (catalog context
 * + reference photos). The value readout prefers real market data (Guild
 * sales, then documented comps) and falls back to the AI's estimate, with
 * the IG resale ledger shown as history.
 */

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SCAN_PHOTOS = 3;

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user, role } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    images?: { base64?: string; media_type?: string }[];
    brandHint?: string;
    modelHint?: string;
  };

  const images = (body.images ?? [])
    .filter((i) => typeof i?.base64 === 'string' && i.base64.length > 100)
    .slice(0, MAX_SCAN_PHOTOS);
  if (!images.length) {
    return NextResponse.json({ error: 'At least one photo required' }, { status: 400 });
  }

  const usage = await checkAndIncrementAiUsage(admin, user!.id, {
    bypass: isAiRateLimitBypass(role),
  });
  if (!usage.allowed) {
    return NextResponse.json(
      { error: aiLimitReachedMessage(usage.count, usage.limit), remaining: 0 },
      { status: 429 }
    );
  }

  const queryBlocks: ClaudeMessageContent[] = images.map((i) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: ALLOWED_MEDIA.has(i.media_type ?? '') ? (i.media_type as string) : 'image/jpeg',
      data: (i.base64 as string).replace(/^data:[^,]+,/, ''),
    },
  }));

  const brandHint = body.brandHint?.trim() || undefined;
  const modelHint = body.modelHint?.trim() || undefined;
  const catalogContext = await getCatalogContext(supabase, brandHint);
  const catalogEntries = await fetchCatalogEntries(supabase, brandHint);

  const { blocks, queryImageCount, referenceImageCount } = buildShoeIdVisionContent(
    [],
    catalogEntries,
    { brandHint, modelHint, queryBlocks }
  );

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
      console.error('shoe-scan parse:', e, claude.ok ? claude.result.text.slice(0, 300) : '');
    }
  }
  if (!parsed) {
    const detail =
      !claude.ok && claude.reason === 'missing_key'
        ? 'ANTHROPIC_API_KEY is not set.'
        : !claude.ok && claude.reason === 'api_error' && claude.detail === '413'
          ? 'Photos too large — try fewer or retake them.'
          : 'Shoe identification unavailable — try again.';
    return NextResponse.json({ error: detail }, { status: 503 });
  }

  // Value: real market data first, AI's own estimate as the fallback. The
  // catalog row's canonical names key all market lookups, so a descriptive
  // model name from vision still lands on its price history via aliases.
  const catalogRow = await findCatalogEntryWithAliases(
    admin,
    parsed.brand,
    parsed.model,
    parsed.model_aliases
  );
  const catalogMatchId = (catalogRow?.id as string | undefined) ?? null;
  const valuationBrand = (catalogRow?.brand as string | undefined) ?? parsed.brand;
  const valuationModel = (catalogRow?.model as string | undefined) ?? parsed.model;
  const market = await fetchMarketValueData(admin, {
    brand: valuationBrand,
    model: valuationModel,
    colorway: parsed.colorway,
  });
  const enrichment = catalogRow
    ? enrichmentFromCatalog(catalogRow as CatalogEntryRow, parsed.colorway)
    : null;

  const value = market.marketValue
    ? {
        low_cents: market.marketValue.low_cents,
        mid_cents: market.marketValue.mid_cents,
        high_cents: market.marketValue.high_cents,
        confidence: market.marketValue.confidence,
        note: market.marketValue.confidence_note,
        source: 'market' as const,
      }
    : {
        low_cents: parsed.value_low_cents,
        mid_cents: parsed.value_mid_cents,
        high_cents: parsed.value_high_cents,
        confidence: 'low' as const,
        note: 'AI estimate — no documented sales for this model yet.',
        source: 'ai' as const,
      };

  const ig = getIgPriceHistory(valuationBrand, valuationModel);

  const { data: resultRow, error: insertErr } = await admin
    .from('shoe_id_results')
    .insert({
      user_id: user!.id,
      listing_id: null,
      catalog_match_id: catalogMatchId,
      images_analyzed: queryImageCount,
      identified_brand: parsed.brand,
      identified_model: parsed.model,
      identified_era: parsed.era,
      identified_colorway: parsed.colorway,
      identified_rarity: parsed.rarity,
      value_low_cents: value.low_cents,
      value_mid_cents: value.mid_cents,
      value_high_cents: value.high_cents,
      confidence: parsed.confidence,
      raw_response: { ...parsed, scan: true },
    })
    .select('id')
    .single();
  if (insertErr) console.error('shoe-scan result insert:', insertErr);

  const tokens = claude.ok ? claude.result : { tokensIn: 0, tokensOut: 0 };
  void admin.from('market_ai_logs').insert({
    user_id: user!.id,
    listing_id: null,
    route: 'shoe-scan',
    model_used: ANTHROPIC_MODEL,
    tokens_in: tokens.tokensIn ?? 0,
    tokens_out: tokens.tokensOut ?? 0,
    cost_estimate_cents: 2,
  });

  return NextResponse.json({
    result: parsed,
    resultId: resultRow?.id ?? null,
    catalogMatched: Boolean(catalogMatchId),
    canonical: catalogRow ? { brand: valuationBrand, model: valuationModel } : null,
    enrichment,
    value,
    counts: {
      guild_sales: market.soldComps.length,
      documented_comps: market.documentedComps.length,
      active_listings: market.askingComps.length,
    },
    ig: ig
      ? {
          posts: ig.posts,
          priced: ig.priced,
          median_usd: ig.median_usd,
          recent_median_usd: ig.median_recent_24mo_usd,
          min_usd: ig.min_usd,
          max_usd: ig.max_usd,
          span: [ig.first_date?.slice(0, 4), ig.last_date?.slice(0, 4)].filter(Boolean).join('–'),
        }
      : null,
    remaining: usage.remaining,
  });
}
