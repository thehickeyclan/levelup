import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { fetchCatalogListingEnrichment } from '@/lib/market/catalog-listing-enrich';
import { resolveListingRarity } from '@/lib/market/resolve-listing-rarity';
import { normalizeMarketRarity } from '@/lib/market/rarity';
import { isMissingColumnError } from '@/lib/market/listing-column-fallback';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;

  const body = (await req.json().catch(() => ({}))) as {
    brand?: string;
    model?: string;
    colorway?: string | null;
    listingId?: string;
    persist?: boolean;
  };

  const brand = body.brand?.trim() ?? '';
  const model = body.model?.trim() ?? '';
  if (!brand || !model) {
    return NextResponse.json({ error: 'Brand and model required' }, { status: 400 });
  }

  const listingId = body.listingId?.trim();
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

  const catalog = await fetchCatalogListingEnrichment(supabase, brand, model);

  let rarity = catalog?.rarity ?? null;
  if (!rarity) {
    const resolved = await resolveListingRarity(supabase, {
      listingId,
      brand,
      model,
      colorway: body.colorway?.trim() || null,
    });
    rarity = resolved.rarity ?? null;
  }

  if (listingId && body.persist !== false && rarity) {
    const admin = createAdminClient(tenant.slug);
    const { error } = await admin
      .from('market_listings')
      .update({ rarity })
      .eq('id', listingId)
      .eq('seller_id', user!.id);
    if (error && !isMissingColumnError(error.message, 'rarity')) {
      console.error('catalog lookup rarity persist:', error);
    }
  }

  return NextResponse.json({
    found: Boolean(catalog),
    model_year: catalog?.model_year ?? null,
    weight_class: catalog?.weight_class ?? null,
    rarity: rarity ? normalizeMarketRarity(rarity) : null,
    collector_notes: catalog?.collector_notes ?? null,
  });
}
