import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { resolveCoachActorId } from '@/lib/coach-actor-server';

export const dynamic = 'force-dynamic';

const BUCKET = 'coach-playbook-videos';
const CATEGORIES = new Set([
  'coaching',
  'facilities',
  'session_ideas',
  'parent_communication',
  'business',
  'recruiting',
  'other',
]);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v']);
const MAX_FILE_BYTES = 75 * 1024 * 1024;

async function authenticatedCoach() {
  const headerStore = await headers();
  const tenant = getTenantFromRequestHeaders(headerStore);
  if (!tenant) return { error: 'Tenant not found', status: 404 } as const;

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 } as const;

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (userRow?.role !== 'coach' && userRow?.role !== 'admin') {
    return { error: 'Coach access required', status: 403 } as const;
  }

  return {
    tenant,
    supabase,
    user,
    role: userRow.role as 'coach' | 'admin',
    admin: createAdminClient(tenant.slug),
  } as const;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticatedCoach();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const search = req.nextUrl.searchParams.get('search')?.trim().slice(0, 100) ?? '';
    const category = req.nextUrl.searchParams.get('category')?.trim() ?? '';
    const coachId = req.nextUrl.searchParams.get('coachId')?.trim() ?? '';
    const savedOnly = req.nextUrl.searchParams.get('saved') === 'true';
    const requestedLimit = Number(req.nextUrl.searchParams.get('limit') ?? 30);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50)
      : 30;

    let query = auth.admin
      .from('coach_playbook_posts')
      .select(
        'id, coach_id, title, caption, category, storage_path, duration_seconds, created_at, athletes(first_name, last_name, photo_url)'
      )
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (CATEGORIES.has(category)) query = query.eq('category', category);
    if (coachId) query = query.eq('coach_id', coachId);
    if (search) {
      const escaped = search.replaceAll('%', '\\%').replaceAll(',', ' ');
      query = query.or(`title.ilike.%${escaped}%,caption.ilike.%${escaped}%`);
    }

    const { data: rows, error } = await query;
    if (error) {
      const missingSetup =
        error.message.includes('coach_playbook_posts') ||
        error.message.toLowerCase().includes('schema cache');
      return NextResponse.json(
        {
          error: missingSetup
            ? 'Coach Playbook database setup is not installed yet.'
            : error.message,
        },
        { status: 500 }
      );
    }
    const posts = rows ?? [];
    const ids = posts.map((post) => post.id);
    if (ids.length === 0) return NextResponse.json({ posts: [] });

    const paths = posts.map((post) => post.storage_path);
    const [{ data: signed }, { data: reactions }, { data: saves }] = await Promise.all([
      auth.admin.storage.from(BUCKET).createSignedUrls(paths, 60 * 60),
      auth.admin.from('coach_playbook_reactions').select('post_id, user_id').in('post_id', ids),
      auth.admin.from('coach_playbook_saves').select('post_id, user_id').in('post_id', ids),
    ]);
    const signedByPath = new Map(
      (signed ?? []).map((entry) => [entry.path, entry.signedUrl])
    );
    const reactionCounts = new Map<string, number>();
    for (const reaction of reactions ?? []) {
      reactionCounts.set(reaction.post_id, (reactionCounts.get(reaction.post_id) ?? 0) + 1);
    }
    const viewerReactions = new Set(
      (reactions ?? [])
        .filter((reaction) => reaction.user_id === auth.user.id)
        .map((reaction) => reaction.post_id)
    );
    const viewerSaves = new Set(
      (saves ?? [])
        .filter((save) => save.user_id === auth.user.id)
        .map((save) => save.post_id)
    );

    const hydrated = posts
      .map((post) => ({
        ...post,
        videoUrl: signedByPath.get(post.storage_path) ?? null,
        helpfulCount: reactionCounts.get(post.id) ?? 0,
        viewerHelpful: viewerReactions.has(post.id),
        viewerSaved: viewerSaves.has(post.id),
        canDelete: auth.role === 'admin' || post.coach_id === auth.user.id,
      }))
      .filter((post) => !savedOnly || post.viewerSaved);

    return NextResponse.json({ posts: hydrated });
  } catch (error) {
    console.error('coach playbook GET:', error);
    return NextResponse.json({ error: 'Could not load Coach Playbook' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticatedCoach();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const actor = await resolveCoachActorId(auth.supabase, auth.user.id);
    if (!actor.ok) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const form = await req.formData();
    const title = String(form.get('title') ?? '').trim();
    const caption = String(form.get('caption') ?? '').trim();
    const category = String(form.get('category') ?? 'coaching').trim();
    const durationSeconds = Math.ceil(Number(form.get('durationSeconds')));
    const video = form.get('video');

    if (!title || title.length > 100) {
      return NextResponse.json({ error: 'Title must be 1–100 characters.' }, { status: 400 });
    }
    if (caption.length > 500) {
      return NextResponse.json({ error: 'Description must be 500 characters or less.' }, { status: 400 });
    }
    if (!CATEGORIES.has(category)) {
      return NextResponse.json({ error: 'Choose a valid category.' }, { status: 400 });
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 60) {
      return NextResponse.json({ error: 'Coach Playbook videos must be 60 seconds or less.' }, { status: 400 });
    }
    if (!(video instanceof File)) {
      return NextResponse.json({ error: 'Choose or record a video.' }, { status: 400 });
    }
    if (video.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Video is too large. Keep it under 75 MB.' }, { status: 400 });
    }
    if (!VIDEO_TYPES.has(video.type)) {
      return NextResponse.json({ error: 'Use an MP4, MOV, or M4V video.' }, { status: 400 });
    }

    const extension =
      video.type === 'video/quicktime' ? 'mov' : video.type === 'video/x-m4v' ? 'm4v' : 'mp4';
    const postId = crypto.randomUUID();
    const path = `${actor.coachId}/${postId}.${extension}`;
    const bytes = Buffer.from(await video.arrayBuffer());
    const { error: uploadError } = await auth.admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: video.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: post, error: insertError } = await auth.admin
      .from('coach_playbook_posts')
      .insert({
        id: postId,
        coach_id: actor.coachId,
        uploaded_by: auth.user.id,
        title,
        caption: caption || null,
        category,
        storage_path: path,
        duration_seconds: durationSeconds,
      })
      .select('id, coach_id, title, caption, category, duration_seconds, created_at')
      .single();
    if (insertError) {
      await auth.admin.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    console.error('coach playbook POST:', error);
    return NextResponse.json({ error: 'Could not publish video' }, { status: 500 });
  }
}
