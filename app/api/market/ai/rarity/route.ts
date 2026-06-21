import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage, isAiRateLimitBypass, aiLimitReachedMessage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude, ANTHROPIC_MODEL } from '@/lib/market/ai/client';
import { RARITY_ASSESS_SYSTEM, rarityAssessUserMessage } from '@/lib/market/ai/rarity-prompts';
import { getCatalogContext } from '@/lib/market/shoe-id/catalog';
import { resolveListingRarity } from '@/lib/market/resolve-listing-rarity';
import { normalizeMarketRarity, type MarketRarity } from '@/lib/market/rarity';
import { isMissingColumnError } from '@/lib/market/listing-column-fallback';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

const RarityAssessSchema = z.object({
  rarity: z.enum(['common', 'uncommon', 'rare', 'grail']),
  rarity_note: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user, role } = ctx;

  const body = (await req.json().catch(() => ({}))) as {
    listingId?: string;
    brand?: string;
    model?: string;
    colorway?: string | null;
    model_year?: number | null;
    persist?: boolean;
  };

  const listingId = body.listingId?.trim();
  let brand = body.brand?.trim() ?? '';
  let model = body.model?.trim() ?? '';
  let colorway = body.colorway?.trim() || null;
  let modelYear = body.model_year ?? null;

  if (listingId) {
    const { data: listing } = await supabase
      .from('market_listings')
      .select('seller_id, brand, model, colorway, model_year, rarity')
      .eq('id', listingId)
      .single();
    if (!listing || listing.seller_id !== user!.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    brand = brand || String(listing.brand ?? '');
    model = model || String(listing.model ?? '');
    colorway = colorway ?? (listing.colorway as string | null);
    modelYear = modelYear ?? (listing.model_year as number | null);
    const existing = normalizeMarketRarity(listing.rarity as string | null);
    if (existing && body.persist !== true) {
      return NextResponse.json({ rarity: existing, source: 'listing', persisted: true });
    }
  }

  if (!brand || !model) {
    return NextResponse.json({ error: 'Brand and model required' }, { status: 400 });
  }

  const resolved = await resolveListingRarity(supabase, {
    listingId,
    brand,
    model,
    colorway,
  });
  if (resolved.rarity) {
    if (listingId && body.persist !== false) {
      await persistListingRarity(supabase, listingId, resolved.rarity);
    }
    return NextResponse.json({
      rarity: resolved.rarity,
      source: resolved.source,
      persisted: Boolean(listingId && body.persist !== false),
    });
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

  const catalogContext = await getCatalogContext(supabase, brand);
  const claude = await callClaude(
    RARITY_ASSESS_SYSTEM,
    [
      {
        type: 'text',
        text: rarityAssessUserMessage({ brand, model, colorway, modelYear, catalogContext }),
      },
    ],
    512
  );

  if (!claude.ok) {
    const detail =
      claude.reason === 'missing_key'
        ? 'ANTHROPIC_API_KEY is not set.'
        : 'Rarity assessment unavailable — try again.';
    return NextResponse.json({ error: detail }, { status: 503 });
  }

  let parsed: z.infer<typeof RarityAssessSchema> | null = null;
  try {
    parsed = RarityAssessSchema.parse(JSON.parse(extractJsonFromClaude(claude.result.text)));
  } catch (e) {
    console.error('rarity assess parse:', e, claude.result.text);
    return NextResponse.json({ error: 'Could not parse rarity assessment' }, { status: 503 });
  }

  const tokens = claude.result;
  void admin.from('market_ai_logs').insert({
    user_id: user!.id,
    listing_id: listingId ?? null,
    route: 'rarity',
    model_used: ANTHROPIC_MODEL,
    tokens_in: tokens.tokensIn ?? 0,
    tokens_out: tokens.tokensOut ?? 0,
    cost_estimate_cents: 1,
  });

  if (listingId && body.persist !== false) {
    await persistListingRarity(supabase, listingId, parsed.rarity);
  }

  return NextResponse.json({
    rarity: parsed.rarity,
    rarity_note: parsed.rarity_note ?? null,
    source: 'ai',
    remaining: usage.remaining,
    persisted: Boolean(listingId && body.persist !== false),
  });
}

async function persistListingRarity(
  supabase: SupabaseClient,
  listingId: string,
  rarity: MarketRarity
) {
  let { error } = await supabase
    .from('market_listings')
    .update({ rarity })
    .eq('id', listingId);
  if (error && isMissingColumnError(error.message, 'rarity')) {
    return;
  }
  if (error) console.error('persist listing rarity:', error);
}
