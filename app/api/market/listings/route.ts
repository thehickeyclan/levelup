import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';
import { primaryListingImage, primaryListingImageUrl } from '@/lib/market/listing-images';
import { fetchMarketBrandCatalog, resolveListingBrand } from '@/lib/market/market-brand-catalog';
import { isMissingColumnError, withoutColorFamily, withoutColumn, isMissingPurchasePrivateListingColumnError, withoutPurchasePrivateListingFields, hasPurchasePrivateListingFields } from '@/lib/market/listing-column-fallback';
import { normalizeMarketRarity } from '@/lib/market/rarity';
import { normalizeListingAcceptsOffers, normalizeListingTypeForWrite } from '@/lib/market/accepts-offers';
import { optionalMarketUser } from '@/lib/market/auth';

export async function GET(req: NextRequest) {
  // Browsing is public; seller=me and non-active statuses still require sign-in.
  const ctx = await optionalMarketUser();
  if ('error' in ctx && ctx.error) return ctx.error;
  const { db: supabase, user } = ctx;

  const sp = req.nextUrl.searchParams;
  const sellerMe = sp.get('seller') === 'me';
  const status = sp.get('status') || 'active';
  const excludeId = sp.get('exclude')?.trim();
  const brand = sp.get('brand');
  const listingType = sp.get('listing_type');
  const size = sp.get('size');
  const requestedLimit = Number(sp.get('limit'));
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 150)
    : 50;

  let q = supabase
    .from('market_listings')
    .select(`
      id, title, brand, model, model_year, size, condition, wear_state, price_cents, shipping_cents,
      listing_type, status, open_to_trade, created_at, seller_id,
      market_listing_images(id, public_url, clean_public_url, use_clean, display_order),
      market_ai_analysis(analyzed_at)
    `)
    .eq('tenant_slug', ctx.tenant.slug)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (sellerMe) {
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    q = q.eq('seller_id', user.id);
    if (status) q = q.eq('status', status);
  } else {
    q = q.eq('status', 'active');
  }

  if (brand) q = q.eq('brand', brand);
  if (listingType) q = q.eq('listing_type', listingType);
  if (size) q = q.eq('size', Number(size));
  if (excludeId) q = q.neq('id', excludeId);

  const { data, error } = await q;
  if (error) {
    console.error('market listings GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const listings = (data ?? []).map((row) => {
    const ai = row.market_ai_analysis as { analyzed_at?: string } | { analyzed_at?: string }[] | null;
    const aiRow = Array.isArray(ai) ? ai[0] : ai;
    const images = row.market_listing_images as {
      public_url: string;
      clean_public_url?: string | null;
      use_clean?: boolean;
      display_order: number;
    }[] | null;
    const primaryImage = primaryListingImage(images);
    const { market_ai_analysis: _omit, ...rest } = row as Record<string, unknown>;
    return {
      ...rest,
      primary_image_url: primaryListingImageUrl(images),
      primary_original_image_url: primaryImage?.public_url ?? null,
      ai_assisted: Boolean(aiRow?.analyzed_at),
    };
  });

  const catalog = await fetchMarketBrandCatalog(ctx.supabase, ctx.tenant.slug);

  return NextResponse.json({ listings, brands: catalog.sellerBrands });
}

export async function POST(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;

  const body = (await req.json().catch(() => ({}))) as {
    draft?: boolean;
    title?: string;
    brand?: string;
    model?: string;
    size?: number;
    condition?: string;
    listing_type?: string;
    price_cents?: number;
    shipping_cents?: number;
    open_to_trade?: boolean;
    accepts_offers?: boolean;
    open_to_boot?: boolean;
    description?: string;
    weight_class?: string;
    model_year?: number | null;
    wear_state?: string;
    colorway?: string | null;
    color_family?: string | null;
    rarity?: string | null;
    purchase_source?: string | null;
    purchase_price_cents?: number | null;
    purchased_at?: string | null;
    collector_notes?: string | null;
  };

  const isDraft = body.draft === true || !body.brand;

  const listingType = normalizeListingTypeForWrite((body.listing_type || 'sell') as string);
  const priceCents =
    listingType === 'collection' || listingType === 'trade' ? null : body.price_cents ?? null;

  const row = {
    tenant_slug: tenant.slug,
    seller_id: user!.id,
    listing_type: listingType,
    status: isDraft ? 'draft' : 'active',
    title: body.title?.trim() || 'Wrestling sneakers',
    brand: body.brand?.trim() || 'Other',
    model: body.model?.trim() || '',
    size: body.size ?? 10,
    condition: body.condition || 'good',
    price_cents: priceCents,
    shipping_cents: listingType === 'collection' ? 0 : body.shipping_cents ?? 800,
    open_to_trade: body.open_to_trade ?? false,
    accepts_offers: normalizeListingAcceptsOffers(listingType, priceCents, body.accepts_offers),
    open_to_boot: body.open_to_boot ?? false,
    description: body.description?.trim() || null,
    collector_notes:
      typeof body.collector_notes === 'string' ? body.collector_notes.trim() || null : null,
    weight_class: body.weight_class || null,
    model_year: body.model_year ?? null,
    wear_state: body.wear_state === 'bnib' || body.wear_state === 'new_no_box' ? body.wear_state : 'used',
    colorway: typeof body.colorway === 'string' ? body.colorway.trim() || null : null,
    color_family:
      typeof body.color_family === 'string' && body.color_family.trim()
        ? body.color_family.trim().toLowerCase()
        : null,
    rarity: normalizeMarketRarity(body.rarity ?? null),
    purchase_source:
      typeof body.purchase_source === 'string' ? body.purchase_source.trim() || null : null,
    purchase_price_cents:
      typeof body.purchase_price_cents === 'number' && body.purchase_price_cents > 0
        ? Math.round(body.purchase_price_cents)
        : null,
    purchased_at:
      typeof body.purchased_at === 'string' && body.purchased_at.trim()
        ? body.purchased_at.trim()
        : null,
  };

  row.brand = resolveListingBrand(
    row.brand,
    await fetchMarketBrandCatalog(createAdminClient(tenant.slug), tenant.slug)
  );

  let insertRow: Record<string, unknown> = { ...row };
  let { data, error } = await supabase.from('market_listings').insert(insertRow).select('id').single();
  for (let attempt = 0; attempt < 3 && error; attempt++) {
    const msg = error.message;
    if (isMissingColumnError(msg, 'color_family') && 'color_family' in insertRow) {
      insertRow = withoutColorFamily(insertRow);
    } else if (isMissingColumnError(msg, 'rarity') && 'rarity' in insertRow) {
      insertRow = withoutColumn(insertRow, 'rarity');
    } else if (
      isMissingPurchasePrivateListingColumnError(msg) &&
      hasPurchasePrivateListingFields(insertRow)
    ) {
      insertRow = withoutPurchasePrivateListingFields(insertRow);
    } else if (isMissingColumnError(msg, 'accepts_offers') && 'accepts_offers' in insertRow) {
      insertRow = withoutColumn(insertRow, 'accepts_offers');
    } else if (isMissingColumnError(msg, 'collector_notes') && 'collector_notes' in insertRow) {
      insertRow = withoutColumn(insertRow, 'collector_notes');
    } else {
      break;
    }
    ({ data, error } = await supabase.from('market_listings').insert(insertRow).select('id').single());
  }
  if (error || !data) {
    console.error('market listings POST:', error);
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  return NextResponse.json({ listingId: data.id });
}
