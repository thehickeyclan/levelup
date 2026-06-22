import { NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { fetchMarketBrandCatalog } from '@/lib/market/market-brand-catalog';

export async function GET() {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;

  const catalog = await fetchMarketBrandCatalog(ctx.supabase, ctx.tenant.slug);
  return NextResponse.json({
    sellerBrands: catalog.sellerBrands,
    browseBrands: catalog.browseBrands,
    customBrands: catalog.customBrands,
  });
}
