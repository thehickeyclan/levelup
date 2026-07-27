import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { assertCanPostPhotosToSession } from '@/lib/activity-feed/photo-post-auth';

const BUCKET = 'activity-photos';
const MAX_PHOTOS_PER_POST = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  return 'jpg';
}

/** POST multipart — share photos from a completed session. */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    const role = userData?.role ?? 'parent';
    if (!['parent', 'coach', 'youth_wrestler', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cookieStore = await cookies();
    const viewAsCoachId =
      role === 'admin'
        ? headersList.get('x-levelup-coach-id')?.trim() ||
          cookieStore.get('levelup_view_as_coach_id')?.value?.trim() ||
          null
        : null;

    const formData = await req.formData();
    const sessionId = String(formData.get('sessionId') ?? '').trim();
    const youthWrestlerIdRaw = String(formData.get('youthWrestlerId') ?? '').trim();
    const youthWrestlerId = youthWrestlerIdRaw || null;
    const caption = String(formData.get('caption') ?? '').trim().slice(0, 280) || null;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ error: 'Add at least one photo' }, { status: 400 });
    }
    if (files.length > MAX_PHOTOS_PER_POST) {
      return NextResponse.json({ error: `Up to ${MAX_PHOTOS_PER_POST} photos at a time` }, { status: 400 });
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: 'Photos must be JPEG, PNG, or WebP' }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: 'Each photo must be under 5MB' }, { status: 400 });
      }
    }

    const admin = createAdminClient(tenant.slug);
    const access = await assertCanPostPhotosToSession(
      admin,
      {
        userId: user.id,
        role,
        coachId: role === 'coach' ? user.id : viewAsCoachId,
      },
      sessionId,
      youthWrestlerId
    );

    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    let postQuery = admin
      .from('activity_posts')
      .select('id, caption')
      .eq('session_id', sessionId)
      .eq('trigger_type', 'photo_post');

    if (youthWrestlerId) {
      postQuery = postQuery.eq('youth_wrestler_id', youthWrestlerId);
    } else {
      postQuery = postQuery.is('youth_wrestler_id', null).eq('coach_id', access.session.athlete_id);
    }

    const { data: existingPost } = await postQuery.maybeSingle();

    let postId = existingPost?.id as string | undefined;

    if (postId) {
      const { count } = await admin
        .from('activity_photos')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId);

      const existingCount = count ?? 0;
      if (existingCount + files.length > MAX_PHOTOS_PER_POST) {
        return NextResponse.json(
          {
            error: `This session post already has ${existingCount} photo(s). Max ${MAX_PHOTOS_PER_POST} per post.`,
          },
          { status: 400 }
        );
      }

      if (caption && !existingPost?.caption) {
        await admin.from('activity_posts').update({ caption }).eq('id', postId);
      }
    } else {
      const { data: created, error: createErr } = await admin
        .from('activity_posts')
        .insert({
          trigger_type: 'photo_post',
          session_id: sessionId,
          coach_id: access.session.athlete_id,
          youth_wrestler_id: youthWrestlerId,
          actor_parent_id: access.actorParentId,
          caption,
          is_public: true,
          parent_approved: true,
        })
        .select('id')
        .single();

      if (createErr || !created) {
        console.error('activity photo post insert:', createErr);
        return NextResponse.json({ error: createErr?.message ?? 'Failed to create post' }, { status: 500 });
      }
      postId = created.id as string;
    }

    const { count: startOrder } = await admin
      .from('activity_photos')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);
    let order = startOrder ?? 0;

    const uploaded: string[] = [];
    for (const file of files) {
      const ext = extForMime(file.type);
      const storagePath = `${sessionId}/${postId}/${crypto.randomUUID()}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

      if (uploadErr) {
        console.error('activity photo upload:', uploadErr);
        return NextResponse.json(
          { error: `Upload failed: ${uploadErr.message}`, uploaded_count: uploaded.length, postId },
          { status: 500 }
        );
      }

      const { error: rowErr } = await admin.from('activity_photos').insert({
        post_id: postId,
        storage_path: storagePath,
        display_order: order,
      });

      if (rowErr) {
        console.error('activity_photos insert:', rowErr);
        await admin.storage.from(BUCKET).remove([storagePath]);
        return NextResponse.json(
          { error: rowErr.message, uploaded_count: uploaded.length, postId },
          { status: 500 }
        );
      }

      uploaded.push(storagePath);
      order += 1;
    }

    return NextResponse.json({
      success: true,
      postId,
      uploaded_count: uploaded.length,
    });
  } catch (e) {
    console.error('activity photos POST:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
