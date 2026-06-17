import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage } from '@/lib/market/ai/rate-limit';
import { callClaude, extractJsonFromClaude } from '@/lib/market/ai/client';
import { PRICE_SYSTEM_PROMPT } from '@/lib/market/ai/prompts';
import { PriceAnalysisSchema } from '@/lib/market/ai/schemas';
import { ANTHROPIC_MODEL } from '@/lib/market/ai/client';

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
  const { supabase, tenant, user } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as { listingId?: string };
  const listingId = body.listingId?.trim();
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 });

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id, brand, model, size, condition')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const usage = await checkAndIncrementAiUsage(admin, user!.id);
  if (!usage.allowed) {
    return NextResponse.json({ error: 'AI limit reached', remaining: 0 }, { status: 429 });
  }

  const { data: similarListings } = await admin
    .from('market_listings')
    .select('id')
    .eq('brand', listing.brand)
    .ilike('model', `%${listing.model}%`);

  const similarIds = (similarListings ?? []).map((l) => l.id);
  let internalComps: { source: 'guild'; price_cents: number; label: string; date?: string }[] = [];

  if (similarIds.length > 0) {
    const { data: internalOrders } = await admin
      .from('market_orders')
      .select('amount_cents, created_at')
      .in('listing_id', similarIds)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10);

    internalComps = (internalOrders ?? []).map((o) => ({
      source: 'guild' as const,
      price_cents: o.amount_cents as number,
      label: 'Guild sale',
      date: o.created_at as string,
    }));
  }

  let ebayComps: { source: 'ebay'; price_cents: number; label: string }[] = [];
  try {
    const ebayRes = await fetch(
      `${req.nextUrl.origin}/api/market/ai/ebay-comps?q=${encodeURIComponent(`${listing.brand} ${listing.model}`)}&size=${listing.size}`,
      { headers: { cookie: req.headers.get('cookie') || '' } }
    );
    const ebayData = await ebayRes.json();
    ebayComps = ebayData.comps ?? [];
  } catch {
    /* ignore */
  }

  const allComps = [...internalComps, ...ebayComps];
  const compSummary = allComps.map((c) => `${c.source}: $${(c.price_cents / 100).toFixed(0)}`).join(', ');

  const claude = await callClaude(
    PRICE_SYSTEM_PROMPT,
    [{
      type: 'text',
      text: `Brand: ${listing.brand}, Model: ${listing.model}, Size: ${listing.size}, Condition: ${listing.condition}. Internal comps (${internalComps.length}): ${compSummary || 'none'}. eBay comps: ${ebayComps.length}.`,
    }]
  );

  let priceAnalysis = null;
  if (claude?.text) {
    try {
      priceAnalysis = PriceAnalysisSchema.parse(JSON.parse(extractJsonFromClaude(claude.text)));
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
      confidence: internalComps.length >= 3 ? 'medium' : 'low' as const,
      confidence_note: internalComps.length < 3
        ? 'Limited Guild sales — estimate based on external data.'
        : 'Based on recent Guild sales.',
      comps: allComps.slice(0, 10),
      market_note: 'Suggested range — adjust for condition and urgency.',
    };
  }

  if (internalComps.length < 3 && priceAnalysis.confidence === 'high') {
    priceAnalysis.confidence = 'low';
    priceAnalysis.confidence_note = 'Limited Guild comps — treat as estimate.';
  }

  await admin.from('market_ai_analysis').upsert({
    listing_id: listingId,
    price_suggested_low_cents: priceAnalysis.suggested_low_cents,
    price_suggested_mid_cents: priceAnalysis.suggested_mid_cents,
    price_suggested_high_cents: priceAnalysis.suggested_high_cents,
    price_confidence: priceAnalysis.confidence,
    price_confidence_note: priceAnalysis.confidence_note,
    price_comps: priceAnalysis.comps,
    price_market_note: priceAnalysis.market_note,
    model_used: ANTHROPIC_MODEL,
    analyzed_at: new Date().toISOString(),
  }, { onConflict: 'listing_id' });

  return NextResponse.json({ price: priceAnalysis, remaining: usage.remaining });
}
