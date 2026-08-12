import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMarketUser } from '@/lib/market/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const ctx = await requireMarketUser();
  if (ctx.error) return ctx.error;
  const { supabase, tenant, user } = ctx;
  const { id: listingId, imageId } = await params;

  const apiKey = process.env.REMOVE_BG_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: 'Background removal failed — use original',
    });
  }

  const { data: listing } = await supabase
    .from('market_listings')
    .select('seller_id, tenant_slug')
    .eq('id', listingId)
    .single();

  if (!listing || listing.seller_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: image } = await supabase
    .from('market_listing_images')
    .select('id, public_url, storage_path, clean_public_url, clean_storage_path')
    .eq('id', imageId)
    .eq('listing_id', listingId)
    .single();

  if (!image) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  if (image.clean_public_url) {
    return NextResponse.json({ success: true, cleanUrl: image.clean_public_url });
  }

  try {
    const imgRes = await fetch(image.public_url as string);
    if (!imgRes.ok) {
      return NextResponse.json({
        success: false,
        error: 'Background removal failed — use original',
        stage: 'source-fetch',
        detail: imgRes.status,
      });
    }
    const buffer = await imgRes.arrayBuffer();

    const formData = new FormData();
    formData.append('image_file', new Blob([buffer]), 'shoe.jpg');
    formData.append('size', 'auto');
    formData.append('bg_color', 'ffffff');

    const rbgRes = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData,
    });

    if (!rbgRes.ok) {
      console.error('remove.bg:', rbgRes.status, await rbgRes.text().catch(() => ''));
      // remove.bg free tier: ~1 request/minute and monthly credit cap — say which wall we hit.
      const error =
        rbgRes.status === 429
          ? 'Background cleaner is busy — try again in about a minute.'
          : rbgRes.status === 402
            ? 'Monthly background-clean limit reached — original photo used.'
            : 'Background removal failed — use original';
      return NextResponse.json({ success: false, error, code: rbgRes.status });
    }

    const cleanBuffer = await rbgRes.arrayBuffer();
    const cleanStoragePath = `${tenant.slug}/${user!.id}/${listingId}/${imageId}-clean.jpg`;

    // Storage writes go through the admin client (bucket RLS blocks user-scoped
    // uploads) — same as the original photo upload route. Seller is verified above.
    const adminStorage = createAdminClient(tenant.slug);
    const { data: uploadData, error: uploadError } = await adminStorage.storage
      .from('market-listing-photos')
      .upload(cleanStoragePath, Buffer.from(cleanBuffer), {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('clean photo upload:', uploadError);
      return NextResponse.json({
        success: false,
        error: 'Background removal failed — use original',
        stage: 'storage-upload',
        detail: uploadError.message,
      });
    }

    const { data: urlData } = adminStorage.storage
      .from('market-listing-photos')
      .getPublicUrl(uploadData.path);

    // Admin client here too: RLS silently no-ops user-scoped updates on this
    // table (no error, zero rows), which lost the cleaned URL.
    const { error: updateErr } = await adminStorage
      .from('market_listing_images')
      .update({
        clean_storage_path: cleanStoragePath,
        clean_public_url: urlData.publicUrl,
        use_clean: true,
      })
      .eq('id', imageId)
      .eq('listing_id', listingId);

    if (updateErr) {
      return NextResponse.json({
        success: false,
        error: 'Background removal failed — use original',
        stage: 'db-update',
        detail: updateErr.message,
      });
    }

    const admin = createAdminClient(tenant.slug);
    void admin.from('market_ai_logs').insert({
      user_id: user!.id,
      listing_id: listingId,
      route: 'bg-removal',
      model_used: 'remove.bg',
      tokens_in: 0,
      tokens_out: 0,
      cost_estimate_cents: 2,
    });

    return NextResponse.json({ success: true, cleanUrl: urlData.publicUrl });
  } catch (e) {
    console.error('bg clean:', e);
    return NextResponse.json({
      success: false,
      error: 'Background removal failed — use original',
      stage: 'exception',
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
