import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';

const BUCKET = 'activity-photos';

function extensionForPath(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

async function viewerCanSeePost(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  post: {
    is_public?: boolean | null;
    actor_parent_id?: string | null;
    youth_wrestler_id?: string | null;
    coach_id?: string | null;
  }
): Promise<boolean> {
  if (post.is_public === true) return true;
  if (post.actor_parent_id === userId || post.youth_wrestler_id === userId || post.coach_id === userId) {
    return true;
  }
  if (!post.youth_wrestler_id) return false;

  const { data: primary } = await admin
    .from('youth_wrestlers')
    .select('id')
    .eq('id', post.youth_wrestler_id)
    .eq('parent_id', userId)
    .maybeSingle();
  if (primary) return true;

  const { data: linked } = await admin
    .from('youth_wrestler_parents')
    .select('id')
    .eq('youth_wrestler_id', post.youth_wrestler_id)
    .eq('parent_id', userId)
    .maybeSingle();
  return Boolean(linked);
}

/** Render activity photos through the app so legacy HEIC uploads display as JPEG. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: photoId } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient(tenant.slug);
    const { data: photo, error: photoErr } = await admin
      .from('activity_photos')
      .select('id, storage_path, activity_posts(is_public, actor_parent_id, youth_wrestler_id, coach_id)')
      .eq('id', photoId)
      .maybeSingle();

    if (photoErr || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const rawPost = (
      photo as {
        activity_posts?:
          | {
              is_public?: boolean | null;
              actor_parent_id?: string | null;
              youth_wrestler_id?: string | null;
              coach_id?: string | null;
            }
          | Array<{
              is_public?: boolean | null;
              actor_parent_id?: string | null;
              youth_wrestler_id?: string | null;
              coach_id?: string | null;
            }>
          | null;
      }
    ).activity_posts;
    const post = Array.isArray(rawPost) ? rawPost[0] : rawPost;
    if (!post || !(await viewerCanSeePost(admin, user.id, post))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const storagePath = (photo as { storage_path: string }).storage_path;
    const { data: blob, error: downloadErr } = await admin.storage.from(BUCKET).download(storagePath);
    if (downloadErr || !blob) {
      return NextResponse.json({ error: 'Photo file not found' }, { status: 404 });
    }

    const input = Buffer.from(await blob.arrayBuffer());
    const ext = extensionForPath(storagePath);
    const isHeic = ext === 'heic' || ext === 'heif' || blob.type === 'image/heic' || blob.type === 'image/heif';

    if (isHeic) {
      const jpeg = await sharp(input).rotate().jpeg({ quality: 88 }).toBuffer();
      return new NextResponse(new Uint8Array(jpeg), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    return new NextResponse(new Uint8Array(input), {
      status: 200,
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    console.error('activity photo image:', e);
    return NextResponse.json({ error: 'Failed to load photo' }, { status: 500 });
  }
}
