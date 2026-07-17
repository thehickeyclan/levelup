import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantFromRequestHeaders } from '@/config/tenants';

function isExpoPushToken(token: string): boolean {
  return (
    /^ExponentPushToken\[.+]$/.test(token) ||
    /^ExpoPushToken\[.+]$/.test(token)
  );
}

/** Register or refresh an Expo push token for the signed-in user. */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      expo_push_token?: string;
      platform?: string;
    };
    const token = String(body.expo_push_token ?? '').trim();
    if (!token || !isExpoPushToken(token)) {
      return NextResponse.json({ error: 'Invalid Expo push token' }, { status: 400 });
    }

    const platformRaw = String(body.platform ?? 'ios').toLowerCase();
    const platform = platformRaw === 'android' || platformRaw === 'web' ? platformRaw : 'ios';
    const now = new Date().toISOString();

    const { error } = await supabase.from('user_push_tokens').upsert(
      {
        user_id: user.id,
        expo_push_token: token,
        platform,
        enabled: true,
        updated_at: now,
      },
      { onConflict: 'expo_push_token' }
    );

    if (error) {
      console.error('push-token upsert:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('push-token POST:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Disable a token (logout / revoke permission). */
export async function DELETE(req: NextRequest) {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { expo_push_token?: string };
    const token = String(body.expo_push_token ?? '').trim();
    if (!token) {
      return NextResponse.json({ error: 'expo_push_token required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('user_push_tokens')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('expo_push_token', token);

    if (error) {
      console.error('push-token DELETE:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('push-token DELETE:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
