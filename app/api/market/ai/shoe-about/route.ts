import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { checkAndIncrementAiUsage, isAiRateLimitBypass, aiLimitReachedMessage } from '@/lib/market/ai/rate-limit';
import { ensureShoeModelContent, fetchShoeModelAbout, shoeModelAboutNeedsRegeneration, shoeModelHistoryNeedsRegeneration } from '@/lib/market/shoe-model-content';

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user, role } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    brand?: string;
    model?: string;
    modelYear?: number | null;
    listingId?: string;
    generate?: boolean;
  };

  let brand = body.brand?.trim() ?? '';
  let model = body.model?.trim() ?? '';
  let modelYear = body.modelYear ?? null;

  if (body.listingId?.trim()) {
    const { data: listing } = await supabase
      .from('market_listings')
      .select('brand, model, model_year')
      .eq('id', body.listingId.trim())
      .maybeSingle();
    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    brand = String(listing.brand ?? '').trim();
    model = String(listing.model ?? '').trim();
    modelYear = (listing.model_year as number | null) ?? modelYear;
  }

  if (!brand || model.length < 2) {
    return NextResponse.json({ error: 'brand and model required' }, { status: 400 });
  }

  const existing = await fetchShoeModelAbout(supabase, brand, model, modelYear);
  const staleHistory = await shoeModelHistoryNeedsRegeneration(supabase, brand, model);
  const staleAbout = await shoeModelAboutNeedsRegeneration(supabase, brand, model);
  const shouldGenerate = Boolean(body.generate) || staleHistory || staleAbout || !existing;

  if (existing && !shouldGenerate) {
    return NextResponse.json({ shoe_about: existing });
  }

  if (shouldGenerate) {
    const usage = await checkAndIncrementAiUsage(admin, user!.id, {
      bypass: isAiRateLimitBypass(role),
    });
    if (!usage.allowed) {
      return NextResponse.json(
        { error: aiLimitReachedMessage(usage.count, usage.limit), shoe_about: existing ?? null },
        { status: 429 }
      );
    }
  }

  const shoeAbout = await ensureShoeModelContent(admin, {
    brand,
    model,
    modelYear,
    forceRegenerateHistory: Boolean(body.generate),
  });
  return NextResponse.json({ shoe_about: shoeAbout });
}
