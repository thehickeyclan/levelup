import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude, ANTHROPIC_MODEL } from '@/lib/market/ai/client';
import { AGENT_SYSTEM_PROMPT } from '@/lib/market/ai/prompts';
import { AgentResponseSchema } from '@/lib/market/ai/schemas';

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

  const usage = await checkAndIncrementAiUsage(admin, user!.id);
  if (!usage.allowed) {
    return NextResponse.json({ error: 'AI limit reached', remaining: 0 }, { status: 429 });
  }

  const conversation = messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Seller'}: ${m.content}`)
    .join('\n');

  const claude = await callClaude(AGENT_SYSTEM_PROMPT, [{ type: 'text', text: conversation }], 1536);

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

  if (response.has_draft && response.draft?.description && listingId) {
    await admin
      .from('market_listings')
      .update({ description: response.draft.description })
      .eq('id', listingId);
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
