import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { clearCoachPhotoCutout } from '@/lib/coach-photo-cutout';

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
    }

    // Delete old photo if exists
    const { data: oldData } = await supabase
      .from('athletes')
      .select('photo_url, photo_cutout_url')
      .eq('id', user.id)
      .single();

    if (oldData?.photo_url) {
      // Extract path from URL
      const oldUrl = oldData.photo_url;
      const oldPathMatch = oldUrl.match(/\/storage\/v1\/object\/public\/athlete-photos\/(.+)/);
      if (oldPathMatch) {
        await supabase.storage
          .from('athlete-photos')
          .remove([oldPathMatch[1]]);
      }
    }

    // Create file path: {athleteId}/{timestamp}-{filename}
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    // Upload file using server client (has proper auth context for RLS)
    const { data, error: uploadError } = await supabase.storage
      .from('athlete-photos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: `Failed to upload photo: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('athlete-photos')
      .getPublicUrl(data.path);

    // Persist to DB immediately so the photo shows even if profile save fails or is skipped
    const admin = createAdminClient(tenant.slug);
    await clearCoachPhotoCutout(admin, user.id, oldData?.photo_cutout_url);

    const { error: updateError } = await supabase
      .from('athletes')
      .update({ photo_url: urlData.publicUrl, photo_cutout_url: null })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to save photo_url to athletes:', updateError);
      // Still return the URL so the client can retry profile save with it
    }

    return NextResponse.json({ photoUrl: urlData.publicUrl });
  } catch (error: any) {
    console.error('Error uploading photo:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

