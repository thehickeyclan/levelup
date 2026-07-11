import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { renderSessionSharePng } from '@/lib/session-share-graphic/render-session-share-png';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Branded session graphic for sharing an activity feed post (any logged-in viewer). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const headersList = await headers();
    const host = resolveHostnameFromHeaders(headersList) || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: post } = await admin
      .from('activity_posts')
      .select('id, trigger_type, session_id, is_public')
      .eq('id', postId)
      .maybeSingle();

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.trigger_type !== 'session_completed' || !post.session_id) {
      return NextResponse.json({ error: 'This post has no share graphic' }, { status: 400 });
    }

    const themeParam = req.nextUrl.searchParams.get('theme');
    const appOrigin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      (host.startsWith('localhost') ? `http://${host}` : `https://${host}`);

    const png = await renderSessionSharePng(admin, post.session_id as string, {
      themeOverride: themeParam,
      appOrigin,
    });

    if (!png) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="guild-activity-${postId.slice(0, 8)}.png"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[activity share-image GET]', message, e);
    return NextResponse.json({ error: 'Failed to generate image', detail: message }, { status: 500 });
  }
}
