import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude, ANTHROPIC_MODEL } from '@/lib/market/ai/client';
import { AGENT_SYSTEM_PROMPT } from '@/lib/market/ai/prompts';
import { AgentResponseSchema } from '@/lib/market/ai/schemas';
import { wearStateLabel } from '@/lib/market/wear-state';
import { sanitizeBuyerListingDescription } from '@/lib/market/sanitize-listing-description';

function formatAgentListingContext(
  listing: {
    brand: string;
    model: string;
    colorway?: string | null;
    size: number;
    condition: string;
    wear_state: string;
    model_year?: number | null;
    listing_type: string;
  },
  ai?: {
    condition_summary?: string | null;
    cosmetic_summary?: string | null;
    condition_grade_suggested?: string | null;
    condition_score?: number | null;
  } | null
): string {
  const lines = [
    'Server listing context:',
    `Brand: ${listing.brand}`,
    `Model: ${listing.model}`,
    listing.colorway?.trim() ? `Colorway: ${listing.colorway.trim()}` : null,
    listing.model_year ? `Model year: ${listing.model_year}` : null,
    `Size: ${listing.size} US`,
    `Wear: ${wearStateLabel(listing.wear_state as 'bnib' | 'new_no_box' | 'used')}`,
    `Condition: ${listing.condition}`,
    `Listing type: ${listing.listing_type}`,
    ai?.condition_summary ? `Condition notes (private): ${ai.condition_summary}` : null,
    ai?.cosmetic_summary ? `Appearance notes (private): ${ai.cosmetic_summary}` : null,
    ai?.condition_grade_suggested ? `Suggested grade (private): ${ai.condition_grade_suggested}` : null,
    ai?.condition_score != null ? `Wrestle-ready (private): ${ai.condition_score}/10` : null,
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    messages?: { role: string; content: string }[];
    draftId?: string;
    listingId?: string;
  };

  const listingId = (body.draftId ?? body.listingId)?.trim();
  const messages = body.messages ?? [];
  if (!messages.length) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

  let listingContext = '';
  if (listingId) {
    const { data: listing } = await supabase
      .from('market_listings')
      .select(
        'seller_id, brand, model, colorway, size, condition, wear_state, model_year, listing_type'
      )
      .eq('id', listingId)
      .single();

    if (!listing || listing.seller_id !== user!.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: aiRow } = await admin
      .from('market_ai_analysis')
      .select(
        'condition_summary, cosmetic_summary, condition_grade_suggested, condition_score'
      )
      .eq('listing_id', listingId)
      .maybeSingle();

    listingContext = formatAgentListingContext(listing, aiRow);
  }

  const usage = await checkAndIncrementAiUsage(admin, user!.id);
  if (!usage.allowed) {
    return NextResponse.json({ error: 'AI limit reached', remaining: 0 }, { status: 429 });
  }

  const conversation = messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Seller'}: ${m.content}`)
    .join('\n');

  const prompt = listingContext ? `${listingContext}\n\n${conversation}` : conversation;

  const claude = await callClaude(AGENT_SYSTEM_PROMPT, [{ type: 'text', text: prompt }], 1536);

  let response = null;
  if (claude.ok) {
    try {
      response = AgentResponseSchema.parse(JSON.parse(extractJsonFromClaude(claude.result.text)));
    } catch (e) {
      console.error('agent parse:', e, claude.ok ? claude.result.text : '');
    }
  }

  if (!response) {
    const detail = !claude.ok && claude.reason === 'missing_key'
      ? 'ANTHROPIC_API_KEY is not set on this deployment.'
      : 'AI agent unavailable — try again.';
    return NextResponse.json({ error: detail }, { status: 503 });
  }

  if (response.has_draft && response.draft?.description) {
    const clean = sanitizeBuyerListingDescription(response.draft.description);
    response = {
      ...response,
      draft: { ...response.draft, description: clean },
    };
    if (listingId) {
      await admin.from('market_listings').update({ description: clean }).eq('id', listingId);
    }
  }

  const tokens = claude.ok ? claude.result : { tokensIn: 0, tokensOut: 0 };
  void admin.from('market_ai_logs').insert({
    user_id: user!.id,
    listing_id: listingId ?? null,
    route: 'agent',
    model_used: ANTHROPIC_MODEL,
    tokens_in: tokens.tokensIn ?? 0,
    tokens_out: tokens.tokensOut ?? 0,
    cost_estimate_cents: 1,
  });

  return NextResponse.json({ ...response, remaining: usage.remaining });
}
