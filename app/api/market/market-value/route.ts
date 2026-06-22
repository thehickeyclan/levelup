import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { fetchMarketValueData } from '@/lib/market/market-value';

/** Guild Market value from platform sold + active listing comps — no AI call. */
export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { tenant } = ctx;
  const admin = createAdminClient(tenant.slug);

  const body = (await req.json().catch(() => ({}))) as {
    brand?: string;
    model?: string;
    size?: number | null;
    colorway?: string | null;
    listingId?: string | null;
  };

  const brand = body.brand?.trim() ?? '';
  const model = body.model?.trim() ?? '';
  if (!brand || model.length < 2) {
    return NextResponse.json({ error: 'Brand and model required' }, { status: 400 });
  }

  const { soldComps, askingComps, documentedComps, marketValue } = await fetchMarketValueData(admin, {
    brand,
    model,
    size: body.size ?? null,
    colorway: body.colorway?.trim() || null,
    excludeListingId: body.listingId?.trim() || null,
  });

  return NextResponse.json({
    has_market_value: Boolean(marketValue),
    market_value: marketValue,
    sold_comps: soldComps,
    asking_comps: askingComps,
    documented_comps: documentedComps,
  });
}
