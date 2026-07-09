import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { buildSessionShareGraphic } from '@/lib/session-share-graphic/build-session-share-graphic';
import { fetchSessionShareGraphicInput } from '@/lib/session-share-graphic/fetch-session-share-graphic-input';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
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

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    const isAdmin = userData?.role === 'admin';
    const isCoach = userData?.role === 'coach';
    if (!isAdmin && !isCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: session } = await admin
      .from('sessions')
      .select('id, athlete_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (isCoach && session.athlete_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const themeParam = req.nextUrl.searchParams.get('theme');
    const appOrigin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      (host.startsWith('localhost') ? `http://${host}` : `https://${host}`);

    const payload = await fetchSessionShareGraphicInput(admin, sessionId, {
      themeOverride: themeParam,
      appOrigin,
    });
    if (!payload) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const png = await buildSessionShareGraphic(payload.input);

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="guild-session-${sessionId.slice(0, 8)}.png"`,
      },
    });
  } catch (e) {
    console.error('[sessions share-image GET]', e);
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
  }
}
