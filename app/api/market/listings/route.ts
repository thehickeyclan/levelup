import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';
import { primaryListingImageUrl } from '@/lib/market/listing-images';

const BRANDS = ['Adidas', 'Asics', 'Nike', 'New Balance', 'Other'];

export async function GET(req: NextRequest) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase } = ctx;

  const sp = req.nextUrl.searchParams;
  const sellerMe = sp.get('seller') === 'me';
  const status = sp.get('status') || 'active';
  const excludeId = sp.get('exclude')?.trim();
  const brand = sp.get('brand');
  const listingType = sp.get('listing_type');
  const size = sp.get('size');

  let q = supabase
    .from('market_listings')
    .select(`
      id, title, brand, model, model_year, size, condition, wear_state, price_cents, shipping_cents,
      listing_type, status, open_to_trade, created_at, seller_id,
      market_listing_images(id, public_url, clean_public_url, use_clean, display_order),
      market_ai_analysis(analyzed_at)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (sellerMe) {
    q = q.eq('seller_id', ctx.user!.id);
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
    const images = row.market_listing_images as { public_url: string; display_order: number }[] | null;
    const { market_ai_analysis: _omit, ...rest } = row as Record<string, unknown>;
    return {
      ...rest,
      primary_image_url: primaryListingImageUrl(images),
      ai_assisted: Boolean(aiRow?.analyzed_at),
    };
  });

  return NextResponse.json({ listings, brands: BRANDS });
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
    open_to_boot?: boolean;
    description?: string;
    weight_class?: string;
    model_year?: number | null;
    wear_state?: string;
  };

  const isDraft = body.draft === true || !body.brand;

  const row = {
    tenant_slug: tenant.slug,
    seller_id: user!.id,
    listing_type: (body.listing_type || 'sell') as string,
    status: isDraft ? 'draft' : 'active',
    title: body.title?.trim() || 'Wrestling sneakers',
    brand: body.brand?.trim() || 'Other',
    model: body.model?.trim() || '',
    size: body.size ?? 10,
    condition: body.condition || 'good',
    price_cents:
      body.listing_type === 'vault' || body.listing_type === 'collection' || body.listing_type === 'trade'
        ? null
        : body.price_cents ?? null,
    shipping_cents: body.listing_type === 'collection' ? 0 : body.shipping_cents ?? 800,
    open_to_trade: body.open_to_trade ?? false,
    open_to_boot: body.open_to_boot ?? false,
    description: body.description?.trim() || null,
    weight_class: body.weight_class || null,
    model_year: body.model_year ?? null,
    wear_state: body.wear_state === 'bnib' || body.wear_state === 'new_no_box' ? body.wear_state : 'used',
  };

  if (!BRANDS.includes(row.brand)) row.brand = 'Other';

  const { data, error } = await supabase.from('market_listings').insert(row).select('id').single();
  if (error) {
    console.error('market listings POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ listingId: data.id });
}
