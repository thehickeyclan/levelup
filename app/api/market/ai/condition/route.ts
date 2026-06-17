import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude } from '@/lib/market/ai/client';
import { CONDITION_SYSTEM_PROMPT } from '@/lib/market/ai/prompts';
import { ConditionAnalysisSchema } from '@/lib/market/ai/schemas';
import { ANTHROPIC_MODEL } from '@/lib/market/ai/client';

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as { listingId?: string };
  const listingId = body.listingId?.trim();
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id, description')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const usage = await checkAndIncrementAiUsage(admin, user!.id);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: 'AI analysis limit reached. Try again in an hour.', remaining: 0 },
      { status: 429 }
    );
  }

  const { data: images } = await supabase
    .from('market_listing_images')
    .select('public_url')
    .eq('listing_id', listingId)
    .order('display_order', { ascending: true })
    .limit(6);

  if (!images?.length) {
    return NextResponse.json({ error: 'Upload photos first' }, { status: 400 });
  }

  const userContent: { type: 'text'; text: string }[] = [
    {
      type: 'text',
      text: `Description from seller: ${listing.description || 'None provided'}. Analyze condition from photos.`,
    },
  ];

  const visionBlocks = images.map((img) => ({
    type: 'image' as const,
    source: { type: 'url' as const, url: img.public_url },
  }));

  const claude = await callClaude(CONDITION_SYSTEM_PROMPT, [...visionBlocks, ...userContent]);

  let analysis = null;
  if (claude?.text) {
    try {
      const parsed = JSON.parse(extractJsonFromClaude(claude.text));
      analysis = ConditionAnalysisSchema.parse(parsed);
    } catch (e) {
      console.error('condition parse error:', e, claude.text);
    }
  }

  if (!analysis) {
    return NextResponse.json(
      { error: 'AI analysis unavailable. Set ANTHROPIC_API_KEY or try again.' },
      { status: 503 }
    );
  }

  await admin.from('market_ai_analysis').upsert({
    listing_id: listingId,
    condition_score: analysis.score,
    condition_grade_suggested: analysis.grade,
    condition_breakdown: analysis.breakdown,
    condition_summary: analysis.summary,
    listing_tip: analysis.listing_tip ?? null,
    model_used: ANTHROPIC_MODEL,
    analyzed_at: new Date().toISOString(),
  }, { onConflict: 'listing_id' });

  void admin.from('market_ai_logs').insert({
    user_id: user!.id,
    listing_id: listingId,
    route: 'condition',
    model_used: ANTHROPIC_MODEL,
    tokens_in: claude?.tokensIn ?? 0,
    tokens_out: claude?.tokensOut ?? 0,
    cost_estimate_cents: 1,
  });

  return NextResponse.json({ analysis, remaining: usage.remaining });
}
