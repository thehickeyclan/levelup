import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain, resolveHostnameFromHeaders } from '@/config/tenants';
import { buildCoachSessionsShareGraphic } from '@/lib/session-share-graphic/build-session-share-graphic';
import { fetchCoachSessionsShareGraphicInput } from '@/lib/session-share-graphic/fetch-coach-sessions-share-input';
import { ensureCoachPhotoCutout, getRemoveBgApiKey } from '@/lib/coach-photo-cutout';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coachId } = await params;
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

    if (isCoach && coachId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: athlete } = await admin.from('athletes').select('id').eq('id', coachId).maybeSingle();
    if (!athlete) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    const themeParam = req.nextUrl.searchParams.get('theme');
    const appOrigin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      (host.startsWith('localhost') ? `http://${host}` : `https://${host}`);

    const payload = await fetchCoachSessionsShareGraphicInput(admin, coachId, {
      themeOverride: themeParam,
      appOrigin,
    });
    if (!payload) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    let cutoutUrl = payload.input.coachPhotoCutoutUrl ?? null;
    if (payload.input.coachPhotoUrl && getRemoveBgApiKey()) {
      cutoutUrl =
        (await ensureCoachPhotoCutout(
          admin,
          coachId,
          payload.input.coachPhotoUrl,
          cutoutUrl
        )) ?? cutoutUrl;
    }

    const png = await buildCoachSessionsShareGraphic({
      ...payload.input,
      coachPhotoCutoutUrl: cutoutUrl,
      photoAdmin: admin,
    });

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename="guild-coach-${coachId.slice(0, 8)}.png"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[coaches share-image GET]', message, e);
    return NextResponse.json({ error: 'Failed to generate image', detail: message }, { status: 500 });
  }
}
