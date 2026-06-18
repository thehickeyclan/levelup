import { NextRequest, NextResponse } from 'next/server';
import { requireMarketUser } from '@/lib/market/auth';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id: listingId } = await params;

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const orderRaw = formData.get('display_order');
  const displayOrder = orderRaw != null ? Number(orderRaw) : 0;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Please upload JPEG, PNG, or WebP images. HEIC not yet supported.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 });
  }

  const { count } = await supabase
    .from('market_listing_images')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId);

  if ((count ?? 0) >= 6) {
    return NextResponse.json({ error: 'Maximum 6 photos per listing' }, { status: 400 });
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `${Date.now()}.${ext}`;
  const storagePath = `${tenant.slug}/${user!.id}/${listingId}/${fileName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('market-listing-photos')
    .upload(storagePath, buffer, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('market photo upload:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from('market-listing-photos').getPublicUrl(uploadData.path);

  const { data: row, error: insertErr } = await supabase
    .from('market_listing_images')
    .insert({
      listing_id: listingId,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
      display_order: displayOrder,
    })
    .select('id, public_url, clean_public_url, use_clean, display_order')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ image: row });
}
