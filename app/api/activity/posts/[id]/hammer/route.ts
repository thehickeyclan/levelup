import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';

/** Toggle a hammer on an activity post (stored in activity_kudos). */
export async function POST(
  _req: NextRequest,
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

  const { data: existing } = await supabase
    .from('activity_kudos')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    const { count } = await supabase
      .from('activity_kudos')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);
    return NextResponse.json({
      success: true,
      hammer_count: count ?? 0,
      viewer_has_hammer: true,
    });
  }

  const { error } = await supabase.from('activity_kudos').insert({
    post_id: postId,
    user_id: user.id,
  });

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      const { count } = await supabase
        .from('activity_kudos')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId);
      return NextResponse.json({
        success: true,
        hammer_count: count ?? 0,
        viewer_has_hammer: true,
      });
    }
    console.error('activity hammer:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await supabase
    .from('activity_kudos')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);

  return NextResponse.json({
    success: true,
    hammer_count: count ?? 1,
    viewer_has_hammer: true,
  });
}
