import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { createAdminClient } from '@/lib/supabase/admin';
import { primaryListingImageUrl, type MarketListingImageRow } from '@/lib/market/listing-images';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const headersList = await headers();
    const host = resolveHostnameFromHeaders(headersList);
    const tenant = getTenantByDomain(host);

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: listing } = await admin
      .from('market_listings')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!listing || !['active', 'sold', 'traded'].includes(String(listing.status))) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    const { data: imageRows, error: imageError } = await admin
      .from('market_listing_images')
      .select('public_url, clean_public_url, use_clean, display_order')
      .eq('listing_id', id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (imageError) {
      console.error('[market listing share-image images]', imageError.message);
      return NextResponse.json({ error: 'Listing image unavailable' }, { status: 502 });
    }

    const images = (imageRows as MarketListingImageRow[] | null) ?? [];
    const imageUrl = primaryListingImageUrl(images);

    if (!imageUrl) {
      return NextResponse.json({ error: 'Listing image not found' }, { status: 404 });
    }

    const imageRes = await fetch(imageUrl, {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!imageRes.ok) {
      return NextResponse.json({ error: 'Listing image unavailable' }, { status: 502 });
    }

    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Listing image unavailable' }, { status: 502 });
    }

    const bytes = await imageRes.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'Content-Disposition': `inline; filename="guild-market-${id.slice(0, 8)}.jpg"`,
      },
    });
  } catch (e) {
    console.error('[market listing share-image]', e);
    return NextResponse.json({ error: 'Failed to load listing image' }, { status: 500 });
  }
}
