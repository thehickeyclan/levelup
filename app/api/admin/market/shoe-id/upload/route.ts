import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminApi } from '@/lib/admin-api-auth';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const formData = await req.formData();
  const files = formData.getAll('file').filter((f): f is File => f instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }
  if (files.length > 6) {
    return NextResponse.json({ error: 'Maximum 6 photos' }, { status: 400 });
  }

  const admin = createAdminClient(auth.tenantSlug);
  const urls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'JPEG, PNG, or WebP only' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Each file must be under 10MB' }, { status: 400 });
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `${auth.tenantSlug}/shoe-id-training/${auth.userId}/${Date.now()}-${i}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { data, error } = await admin.storage
      .from('market-listing-photos')
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('shoe-id training upload:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = admin.storage.from('market-listing-photos').getPublicUrl(data.path);
    urls.push(urlData.publicUrl);
  }

  return NextResponse.json({ urls });
}
