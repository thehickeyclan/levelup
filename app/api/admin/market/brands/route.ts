import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';
import {
  brandNameAlreadyExists,
  fetchMarketBrandCatalog,
  normalizeNewBrandName,
} from '@/lib/market/market-brand-catalog';

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient(auth.tenantSlug);
  const catalog = await fetchMarketBrandCatalog(admin, auth.tenantSlug);
  return NextResponse.json({
    customBrands: catalog.customBrands,
    sellerBrands: catalog.sellerBrands,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = normalizeNewBrandName(body.name ?? '');
  if (!name) {
    return NextResponse.json(
      { error: 'Brand must be 1–40 characters (letters, numbers, spaces, - & \' .).' },
      { status: 400 }
    );
  }

  const admin = createAdminClient(auth.tenantSlug);
  const catalog = await fetchMarketBrandCatalog(admin, auth.tenantSlug);
  if (brandNameAlreadyExists(name, catalog)) {
    return NextResponse.json({ error: 'That brand already exists.' }, { status: 409 });
  }

  const { data, error } = await admin
    .from('market_brands')
    .insert({
      tenant_slug: auth.tenantSlug,
      name,
      created_by: auth.userId,
    })
    .select('id, name, created_at')
    .single();

  if (error || !data) {
    const msg = error?.message ?? 'Could not add brand';
    if (msg.includes('idx_market_brands_tenant_name_lower') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'That brand already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const updated = await fetchMarketBrandCatalog(admin, auth.tenantSlug);
  return NextResponse.json({
    brand: data,
    sellerBrands: updated.sellerBrands,
    customBrands: updated.customBrands,
  });
}
