import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireMarketUser } from '@/lib/market/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MARKET_LISTING_IMAGE_FIELDS_WITH_ID } from '@/lib/market/listing-images';
import { normalizeListingImageOrders } from '@/lib/market/normalize-listing-image-orders';
import { resolveListingPhotoMime } from '@/lib/market/listing-photo-mime';
import { MAX_LISTING_PHOTO_BYTES } from '@/lib/market/listing-photo-upload-limits';

const MAX_SIZE = MAX_LISTING_PHOTO_BYTES;
const MAX_PHOTOS = 6;

async function assertListingOwner(
  supabase: SupabaseClient,
  userId: string,
  listingId: string
) {
  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== userId) {
    return null;
  }
  return listing;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, user } = ctx;
  const { id: listingId } = await params;

  const listing = await assertListingOwner(supabase, user!.id, listingId);
  if (!listing) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: images, error } = await supabase
    .from('market_listing_images')
    .select(MARKET_LISTING_IMAGE_FIELDS_WITH_ID)
    .eq('listing_id', listingId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ images: images ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id: listingId } = await params;

  const listing = await assertListingOwner(supabase, user!.id, listingId);
  if (!listing) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file || !file.size) {
    return NextResponse.json({ error: 'No photo received — try again.' }, { status: 400 });
  }

  const mime = resolveListingPhotoMime(file);
  if ('error' in mime) {
    return NextResponse.json({ error: mime.error }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Photo must be under 4MB — it is auto-compressed on upload.' }, { status: 400 });
  }

  const admin = createAdminClient(tenant.slug);

  const { count, error: countErr } = await admin
    .from('market_listing_images')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId);

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  if ((count ?? 0) >= MAX_PHOTOS) {
    return NextResponse.json({ error: 'Maximum 6 photos per listing' }, { status: 400 });
  }

  const displayOrder = count ?? 0;
  const fileName = `${Date.now()}-${displayOrder}.${mime.ext}`;
  const storagePath = `${tenant.slug}/${user!.id}/${listingId}/${fileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { data: uploadData, error: uploadError } = await admin.storage
    .from('market-listing-photos')
    .upload(storagePath, buffer, {
      contentType: mime.contentType,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('market photo upload:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = admin.storage.from('market-listing-photos').getPublicUrl(uploadData.path);

  const { data: row, error: insertErr } = await admin
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
    await admin.storage.from('market-listing-photos').remove([storagePath]);
    console.error('market_listing_images insert:', insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await normalizeListingImageOrders(admin, listingId);

  const { data: normalized } = await admin
    .from('market_listing_images')
    .select('id, public_url, clean_public_url, use_clean, display_order')
    .eq('id', row.id)
    .single();

  return NextResponse.json({ image: normalized ?? row });
}
