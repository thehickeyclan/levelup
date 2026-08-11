import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage, isAiRateLimitBypass, aiLimitReachedMessage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude, ANTHROPIC_MODEL } from '@/lib/market/ai/client';
import { listingImagesForClaude } from '@/lib/market/ai/load-listing-images';
import { listingQueryImageBlocks } from '@/lib/market/shoe-id/load-query-images';
import {
  CONDITION_SYSTEM_PROMPT,
  BNIB_CONDITION_PROMPT,
  NEW_NO_BOX_CONDITION_PROMPT,
} from '@/lib/market/ai/prompts';
import { ConditionAnalysisSchema, conditionGradeForWearState, type ConditionAnalysis } from '@/lib/market/ai/schemas';
import type { MarketWearState } from '@/lib/market/wear-state';
import { conditionForWearState, wearStateLabel } from '@/lib/market/wear-state';
import { buildListingDescription } from '@/lib/market/listing-description';

function aiErrorMessage(outcome: { reason: string; detail?: string }, parseFailed: boolean): string {
  if (outcome.reason === 'missing_key') {
    return 'ANTHROPIC_API_KEY is not set on this deployment. Add it in Vercel → redeploy.';
  }
  if (outcome.reason === 'api_error') {
    return `Claude API error (${outcome.detail ?? 'unknown'}). Check billing and API key in Anthropic console.`;
  }
  if (parseFailed) {
    return 'AI returned an unreadable response — try again.';
  }
  return 'AI analysis unavailable — try again.';
}

function promptForWearState(wearState: MarketWearState): string {
  if (wearState === 'bnib') return BNIB_CONDITION_PROMPT;
  if (wearState === 'new_no_box') return NEW_NO_BOX_CONDITION_PROMPT;
  return CONDITION_SYSTEM_PROMPT;
}

function fallbackConditionAnalysis(wearState: MarketWearState): ConditionAnalysis {
  const declaredNew = wearState === 'bnib' || wearState === 'new_no_box';
  const wrestleScore = declaredNew ? 9 : 6;
  const cosmeticScore = declaredNew ? 9 : 6;
  const summary = declaredNew
    ? 'AI reviewed the photos but could not return structured details. Verify the shoes are unworn before publishing.'
    : 'AI reviewed the photos but could not return structured details. Review the condition manually before publishing.';
  const cosmeticSummary = declaredNew
    ? 'Photos should clearly show unworn uppers, soles, and laces.'
    : 'Use the photos and notes to confirm cosmetic wear before publishing.';

  return {
    wrestle_score: wrestleScore,
    cosmetic_score: cosmeticScore,
    grade: declaredNew ? 'new' : 'good',
    summary,
    cosmetic_summary: cosmeticSummary,
    breakdown: {
      sole: { score: wrestleScore, note: 'Review sole tread and grip from photos.' },
      upper: { score: cosmeticScore, note: 'Review upper wear from photos.' },
      midsole: { score: wrestleScore, note: 'Review structure and separation from photos.' },
      laces: { score: cosmeticScore, note: 'Review laces and strap condition from photos.' },
    },
    listing_tip: 'AI could not read its own structured response. Confirm condition before publishing.',
  };
}

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user, role } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    listingId?: string;
    wear_state?: MarketWearState;
    seller_note?: string;
  };
  const listingId = body.listingId?.trim();
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id, description, wear_state, brand, model, colorway, model_year, size, condition')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const wearState = (body.wear_state ?? listing.wear_state ?? 'used') as MarketWearState;

  const usage = await checkAndIncrementAiUsage(admin, user!.id, {
    bypass: isAiRateLimitBypass(role),
  });
  if (!usage.allowed) {
    return NextResponse.json(
      { error: aiLimitReachedMessage(usage.count, usage.limit), remaining: 0 },
      { status: 429 }
    );
  }

  const { data: images } = await supabase
    .from('market_listing_images')
    .select('storage_path, public_url')
    .eq('listing_id', listingId)
    .order('display_order', { ascending: true })
    .limit(6);

  if (!images?.length) {
    return NextResponse.json({ error: 'Upload photos first' }, { status: 400 });
  }

  const storageBlocks = await listingQueryImageBlocks(admin, images);
  const visionBlocks =
    storageBlocks.length > 0 ? storageBlocks : listingImagesForClaude(images);
  if (!visionBlocks.length) {
    return NextResponse.json({ error: 'Could not load photos for analysis. Try re-uploading.' }, { status: 500 });
  }

  const textBlock = {
    type: 'text' as const,
    text: [
      `Seller declares: ${wearStateLabel(wearState)}.`,
      body.seller_note?.trim() ? `Seller personal note: ${body.seller_note.trim()}` : null,
      `Description: ${listing.description || 'None provided'}.`,
      wearState === 'bnib' || wearState === 'new_no_box'
        ? 'Instruction: Do not reject or block seller-declared new inventory from incomplete photos. Ask for clearer proof only as a seller tip.'
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
  };

  const claude = await callClaude(promptForWearState(wearState), [...visionBlocks, textBlock]);

  let analysis: ConditionAnalysis | null = null;
  let parseFailed = false;

  if (claude.ok) {
    try {
      const parsed = JSON.parse(extractJsonFromClaude(claude.result.text));
      const base = ConditionAnalysisSchema.parse(parsed);
      analysis = { ...base, grade: conditionGradeForWearState(wearState, base) };
    } catch (e) {
      parseFailed = true;
      console.error('condition parse error:', e, claude.result.text);
    }
  }

  if (!analysis) {
    if (claude.ok && parseFailed) {
      const fallback = fallbackConditionAnalysis(wearState);
      analysis = { ...fallback, grade: conditionGradeForWearState(wearState, fallback) };
    } else {
      const errOutcome = claude.ok ? { reason: 'parse' } : claude;
      return NextResponse.json(
        { error: aiErrorMessage(errOutcome, parseFailed) },
        { status: 503 }
      );
    }
  }

  await admin.from('market_ai_analysis').upsert({
    listing_id: listingId,
    condition_score: analysis.wrestle_score,
    cosmetic_score: analysis.cosmetic_score,
    condition_grade_suggested: analysis.grade,
    condition_breakdown: analysis.breakdown,
    condition_summary: analysis.summary,
    cosmetic_summary: analysis.cosmetic_summary || null,
    listing_tip: analysis.listing_tip ?? null,
    model_used: ANTHROPIC_MODEL,
    analyzed_at: new Date().toISOString(),
  }, { onConflict: 'listing_id' });

  const tokens = claude.ok ? claude.result : { tokensIn: 0, tokensOut: 0 };
  void admin.from('market_ai_logs').insert({
    user_id: user!.id,
    listing_id: listingId,
    route: 'condition',
    model_used: ANTHROPIC_MODEL,
    tokens_in: tokens.tokensIn ?? 0,
    tokens_out: tokens.tokensOut ?? 0,
    cost_estimate_cents: 1,
  });

  const suggestedDescription = buildListingDescription({
    brand: (listing.brand as string) || 'Other',
    model: (listing.model as string) || '',
    colorway: listing.colorway as string | null,
    modelYear: listing.model_year as number | null,
    size: Number(listing.size) || 10,
    wearState,
    condition: conditionForWearState(
      wearState,
      (listing.condition as string) || 'good'
    ),
    analysis: {
      summary: analysis.summary,
      cosmetic_summary: analysis.cosmetic_summary,
    },
  });

  return NextResponse.json({
    analysis,
    warning: parseFailed ? 'AI returned partial condition details. Review condition before publishing.' : undefined,
    wear_state: wearState,
    suggested_description: suggestedDescription,
    remaining: usage.remaining,
  });
}
