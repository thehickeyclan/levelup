import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage, isAiRateLimitBypass, aiLimitReachedMessage } from '@/lib/market/ai/rate-limit';
import { callClaude, ANTHROPIC_MODEL } from '@/lib/market/ai/client';
import { AGENT_SYSTEM_PROMPT } from '@/lib/market/ai/prompts';
import { parseAgentResponse } from '@/lib/market/parse-agent-response';
import { fetchCatalogListingEnrichment } from '@/lib/market/catalog-listing-enrich';
import { normalizeMarketRarity } from '@/lib/market/rarity';
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
    rarity?: string | null;
    weight_class?: string | null;
  },
  ai?: {
    condition_summary?: string | null;
    cosmetic_summary?: string | null;
    condition_grade_suggested?: string | null;
    condition_score?: number | null;
  } | null,
  extras?: {
    collector_notes?: string | null;
    shoe_era?: string | null;
  }
): string {
  const lines = [
    'Server listing context:',
    `Brand: ${listing.brand}`,
    `Model: ${listing.model}`,
    listing.colorway?.trim() ? `Colorway: ${listing.colorway.trim()}` : null,
    listing.model_year ? `Model year: ${listing.model_year}` : null,
    extras?.shoe_era?.trim() ? `Era (shoe ID): ${extras.shoe_era.trim()}` : null,
    listing.rarity ? `Rarity: ${listing.rarity}` : null,
    listing.weight_class?.trim() ? `Weight: ${listing.weight_class.trim()}` : null,
    `Size: ${listing.size} US`,
    `Wear: ${wearStateLabel(listing.wear_state as 'bnib' | 'new_no_box' | 'used')}`,
    `Condition: ${listing.condition}`,
    `Listing type: ${listing.listing_type}`,
    extras?.collector_notes?.trim()
      ? `Catalog / collector notes: ${extras.collector_notes.trim()}`
      : null,
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
  const { supabase, tenant, user, role } = ctx;
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
        'seller_id, brand, model, colorway, size, condition, wear_state, model_year, listing_type, rarity, weight_class'
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

    const { data: shoeRow } = await admin
      .from('shoe_id_results')
      .select('identified_era, raw_response')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const rawShoe = shoeRow?.raw_response as { collector_notes?: string } | null;
    const catalogEnrich = await fetchCatalogListingEnrichment(
      admin,
      listing.brand as string,
      listing.model as string
    );

    const collectorNotes =
      rawShoe?.collector_notes?.trim() ||
      catalogEnrich?.collector_notes?.trim() ||
      null;

    listingContext = formatAgentListingContext(
      {
        ...listing,
        rarity: normalizeMarketRarity(listing.rarity as string | null) ?? listing.rarity,
      },
      aiRow,
      {
        collector_notes: collectorNotes,
        shoe_era: (shoeRow?.identified_era as string | null) ?? null,
      }
    );
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

  const conversation = messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Seller'}: ${m.content}`)
    .join('\n');

  const prompt = listingContext ? `${listingContext}\n\n${conversation}` : conversation;

  const claude = await callClaude(AGENT_SYSTEM_PROMPT, [{ type: 'text', text: prompt }], 4096);

  let response = null;
  if (claude.ok) {
    response = parseAgentResponse(claude.result.text);
    if (!response) {
      console.error('agent parse failed:', claude.result.text.slice(0, 500));
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
