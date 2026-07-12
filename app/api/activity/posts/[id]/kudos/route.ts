import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import {
  emptyKudosByReaction,
  isActivityReactionId,
  normalizeActivityReactionId,
  totalKudosCount,
  type ActivityReactionId,
} from '@/lib/activity-feed/kudos-reactions';

async function kudosPayloadForPost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  viewerId: string
) {
  const { data: rows, error } = await supabase
    .from('activity_kudos')
    .select('user_id, reaction')
    .eq('post_id', postId);

  if (error) throw error;

  const kudos_by_reaction = emptyKudosByReaction();
  const viewer_reactions: ActivityReactionId[] = [];

  for (const row of rows ?? []) {
    const reaction = normalizeActivityReactionId(row.reaction);
    kudos_by_reaction[reaction] += 1;
    if (row.user_id === viewerId) viewer_reactions.push(reaction);
  }

  return {
    kudos_by_reaction,
    kudos_count: totalKudosCount(kudos_by_reaction),
    viewer_reactions,
  };
}

/** Toggle an emoji reaction on an activity post. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { reaction?: string } = {};
  try {
    body = (await req.json()) as { reaction?: string };
  } catch {
    body = {};
  }

  const reactionRaw = String(body.reaction ?? '').trim();
  if (!isActivityReactionId(reactionRaw)) {
    return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('activity_kudos')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .eq('reaction', reactionRaw)
    .maybeSingle();

  if (existing) {
    const { error: delErr } = await supabase.from('activity_kudos').delete().eq('id', existing.id);
    if (delErr) {
      console.error('activity kudos delete:', delErr);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  } else {
    const { error: insErr } = await supabase.from('activity_kudos').insert({
      post_id: postId,
      user_id: user.id,
      reaction: reactionRaw,
    });

    if (insErr) {
      console.error('activity kudos insert:', insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  try {
    const payload = await kudosPayloadForPost(supabase, postId, user.id);
    return NextResponse.json({ success: true, ...payload });
  } catch (e) {
    console.error('activity kudos payload:', e);
    return NextResponse.json({ error: 'Failed to load reactions' }, { status: 500 });
  }
}
