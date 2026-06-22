import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage, isAiRateLimitBypass, aiLimitReachedMessage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude, ANTHROPIC_MODEL } from '@/lib/market/ai/client';
import { PRICE_SYSTEM_PROMPT } from '@/lib/market/ai/prompts';
import { PriceAnalysisSchema, type PriceAnalysis } from '@/lib/market/ai/schemas';
import { wearStateLabel } from '@/lib/market/wear-state';
import { applyUsedWrestlePriceFloor, applySizeAndCatalogPricing } from '@/lib/market/price-heuristics';
import { buildCatalogPricingContext } from '@/lib/market/catalog-pricing';
import {
  formatGuildCompSummary,
} from '@/lib/market/platform-comps';
import {
  fetchMarketValueData,
  priceAnalysisFromMarketValue,
} from '@/lib/market/market-value';

export async function GET(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;

  const q = req.nextUrl.searchParams.get('q') || '';
  const size = req.nextUrl.searchParams.get('size') || '';

  const apiKey = process.env.EBAY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ comps: [], stub: true });
  }

  try {
    const params = new URLSearchParams({
      q: `${q} wrestling shoes`,
      limit: '10',
    });
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      }
    );
    if (!res.ok) {
      return NextResponse.json({ comps: [], error: 'ebay_failed' });
    }
    const data = (await res.json()) as {
      itemSummaries?: { title?: string; price?: { value?: string } }[];
    };
    const comps = (data.itemSummaries ?? []).slice(0, 8).map((item, i) => ({
      source: 'ebay' as const,
      price_cents: Math.round(parseFloat(item.price?.value || '0') * 100),
      label: item.title?.slice(0, 60) || `eBay result ${i + 1}`,
    }));
    return NextResponse.json({ comps, size });
  } catch (e) {
    console.error('ebay comps:', e);
    return NextResponse.json({ comps: [], stub: true });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user, role } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    listingId?: string;
    brand?: string;
    model?: string;
    size?: number;
    condition?: string;
    listing_type?: string;
    description?: string;
    model_year?: number | null;
    wear_state?: string;
    colorway?: string;
  };

  const listingId = body.listingId?.trim();
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id, brand, model, size, condition, listing_type, description, model_year, title, wear_state, colorway')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Prefer latest form values sent from client (draft may not be saved yet)
  const brand = body.brand?.trim() || listing.brand;
  const model = body.model?.trim() || listing.model;
  const size = body.size ?? listing.size;
  const condition = body.condition || listing.condition;
  const listingType = body.listing_type || listing.listing_type;
  const description = body.description?.trim() ?? listing.description ?? '';
  const modelYear = body.model_year ?? listing.model_year;
  const wearState = body.wear_state || listing.wear_state || 'used';
  const colorway = body.colorway?.trim() || (listing.colorway as string | null) || null;

  const { data: aiRow } = await admin
    .from('market_ai_analysis')
    .select('condition_score, cosmetic_score, condition_grade_suggested, condition_summary, cosmetic_summary')
    .eq('listing_id', listingId)
    .maybeSingle();

  const usage = await checkAndIncrementAiUsage(admin, user!.id, {
    bypass: isAiRateLimitBypass(role),
  });
  if (!usage.allowed) {
    return NextResponse.json(
      { error: aiLimitReachedMessage(usage.count, usage.limit), remaining: 0 },
      { status: 429 }
    );
  }

  const {
    soldComps: guildComps,
    askingComps,
    documentedComps: catalogComps,
    marketValue,
    colorwayProfile,
  } = await fetchMarketValueData(admin, {
    brand,
    model,
    size,
    colorway,
    excludeListingId: listingId,
  });

  const compSummaryBase = [
    `Guild completed sales (${guildComps.length}): ${formatGuildCompSummary(guildComps)}.`,
    askingComps.length
      ? `Guild active listings (${askingComps.length}): ${askingComps.map((c) => `$${Math.round(c.price_cents / 100)} (${c.label})`).join(', ')}.`
      : 'Guild active listings: none for this model right now.',
    catalogComps.length
      ? `Documented resale sales (${catalogComps.length}, Instagram/handbook): ${catalogComps.map((c) => `$${Math.round(c.price_cents / 100)} (${c.label})`).join(', ')}.`
      : 'Documented resale sales: none for this colorway/size in admin catalog yet.',
  ].join(' ');

  if (marketValue) {
    const guidanceComps = [...guildComps, ...askingComps, ...catalogComps];
    let finalPrice = priceAnalysisFromMarketValue(marketValue, guidanceComps);
    finalPrice = applySizeAndCatalogPricing(finalPrice, {
      sizeUs: size,
      colorwayProfile,
    });
    finalPrice = applyUsedWrestlePriceFloor(finalPrice, {
      wearState,
      wrestleScore: aiRow?.condition_score != null ? Number(aiRow.condition_score) : null,
      hasComps: guidanceComps.length > 0,
      brand,
    });
    finalPrice = {
      ...finalPrice,
      comps: guidanceComps.slice(0, 15),
    };

    await admin.from('market_ai_analysis').upsert({
      listing_id: listingId,
      price_suggested_low_cents: finalPrice.suggested_low_cents,
      price_suggested_mid_cents: finalPrice.suggested_mid_cents,
      price_suggested_high_cents: finalPrice.suggested_high_cents,
      price_confidence: finalPrice.confidence,
      price_confidence_note: finalPrice.confidence_note,
      price_comps: finalPrice.comps,
      price_market_note: finalPrice.market_note,
      model_used: 'guild_market_value',
      analyzed_at: new Date().toISOString(),
    }, { onConflict: 'listing_id' });

    return NextResponse.json({ price: finalPrice, remaining: usage.remaining });
  }

  const ebayQuery = [brand, model, modelYear ? String(modelYear) : ''].filter(Boolean).join(' ');
  let ebayComps: { source: 'ebay'; price_cents: number; label: string }[] = [];
  try {
    const ebayRes = await fetch(
      `${req.nextUrl.origin}/api/market/ai/ebay-comps?q=${encodeURIComponent(ebayQuery)}&size=${size}`,
      { headers: { cookie: req.headers.get('cookie') || '' } }
    );
    const ebayData = await ebayRes.json();
    ebayComps = ebayData.comps ?? [];
  } catch {
    /* ignore */
  }

  const guidanceComps = [...guildComps, ...askingComps, ...catalogComps];
  const allComps = [...guidanceComps, ...ebayComps];
  const compSummary = compSummaryBase;

  const aiBits: string[] = [];
  if (aiRow?.condition_score != null) {
    aiBits.push(`AI wrestle-ready: ${aiRow.condition_score}/10`);
  }
  if (aiRow?.cosmetic_score != null) {
    aiBits.push(`AI appearance: ${aiRow.cosmetic_score}/10`);
  }
  if (aiRow?.condition_grade_suggested) {
    aiBits.push(`AI suggested grade: ${aiRow.condition_grade_suggested}`);
  }

  const claude = await callClaude(
    PRICE_SYSTEM_PROMPT,
    [{
      type: 'text',
      text: [
        `Brand: ${brand}`,
        `Model: ${model}`,
        `Size: ${size}`,
        colorway ? `Colorway: ${colorway}` : 'Colorway: unknown',
        `Model year: ${modelYear ?? 'unknown'}`,
        `Wear state: ${wearStateLabel(wearState as 'bnib' | 'new_no_box' | 'used')}`,
        `Condition grade: ${condition}`,
        `Listing type: ${listingType}`,
        aiBits.length ? aiBits.join('. ') : 'No AI condition analysis yet.',
        wearState === 'used' && aiRow?.condition_score != null
          ? 'Pricing instruction: weight wrestle-ready score heavily; appearance is secondary for Guild buyers.'
          : '',
        description ? `Description: ${description.slice(0, 400)}` : 'No description.',
        ...(await buildCatalogPricingContext(admin, brand, model, colorway, size)).promptLines,
        compSummary,
        `eBay comps: ${ebayComps.length}.`,
      ].join('\n'),
    }]
  );

  let priceAnalysis: PriceAnalysis | null = null;
  if (claude.ok) {
    try {
      priceAnalysis = PriceAnalysisSchema.parse(JSON.parse(extractJsonFromClaude(claude.result.text)));
    } catch (e) {
      console.error('price parse:', e);
    }
  }

  if (!priceAnalysis) {
    const fallbackMid = ebayComps[0]?.price_cents ?? 8000;
    priceAnalysis = {
      suggested_low_cents: Math.round(fallbackMid * 0.85),
      suggested_mid_cents: fallbackMid,
      suggested_high_cents: Math.round(fallbackMid * 1.15),
      confidence: guildComps.length >= 3 ? 'medium' : 'low',
      confidence_note: guildComps.length < 3
        ? 'Limited Guild sales — estimate based on external and catalog data.'
        : 'Based on recent Guild sales.',
      comps: allComps.slice(0, 15),
      market_note: 'Suggested range — adjust for condition and urgency.',
    };
  }

  let finalPrice: PriceAnalysis =
    guildComps.length < 3 && priceAnalysis.confidence === 'high'
      ? {
          ...priceAnalysis,
          confidence: 'low',
          confidence_note: 'Limited Guild comps — treat as estimate.',
        }
      : priceAnalysis;

  finalPrice = applySizeAndCatalogPricing(finalPrice, {
    sizeUs: size,
    colorwayProfile,
  });

  finalPrice = applyUsedWrestlePriceFloor(finalPrice, {
    wearState,
    wrestleScore: aiRow?.condition_score != null ? Number(aiRow.condition_score) : null,
    hasComps: allComps.length > 0,
    brand,
  });

  const internalCount = guildComps.length;
  const confidence =
    internalCount >= 10 ? 'high' : internalCount >= 3 ? 'medium' : 'low';
  const confidenceNote =
    internalCount >= 10
      ? 'Based on recent Guild sales.'
      : internalCount >= 3
        ? 'Some Guild comps — treat as estimate.'
        : catalogComps.length
          ? 'No Guild sales yet — range uses documented market data and eBay.'
          : finalPrice.confidence_note;

  finalPrice = {
    ...finalPrice,
    confidence,
    confidence_note: confidenceNote,
    comps: [...guidanceComps, ...ebayComps].slice(0, 15),
  };

  await admin.from('market_ai_analysis').upsert({
    listing_id: listingId,
    price_suggested_low_cents: finalPrice.suggested_low_cents,
    price_suggested_mid_cents: finalPrice.suggested_mid_cents,
    price_suggested_high_cents: finalPrice.suggested_high_cents,
    price_confidence: finalPrice.confidence,
    price_confidence_note: finalPrice.confidence_note,
    price_comps: finalPrice.comps,
    price_market_note: finalPrice.market_note,
    model_used: ANTHROPIC_MODEL,
    analyzed_at: new Date().toISOString(),
  }, { onConflict: 'listing_id' });

  return NextResponse.json({ price: finalPrice, remaining: usage.remaining });
}
