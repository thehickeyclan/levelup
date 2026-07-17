import { NextRequest, NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import {
  filterNotificationsForAudience,
  readNotificationAudienceFromCookies,
  resolveNotificationUserId,
  type NotificationRow,
} from '@/lib/notification-audience';
import { notificationRetentionCutoff } from '@/lib/notification-retention';

async function loadAudienceContext(tenantSlug: string, authUserId: string) {
  const supabase = await createClient(tenantSlug);
  const { data: userData } = await supabase.from('users').select('role').eq('id', authUserId).maybeSingle();
  const cookieStore = await cookies();
  return readNotificationAudienceFromCookies(cookieStore, userData?.role ?? null, authUserId);
}

export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const audience = await loadAudienceContext(tenant.slug, user.id);
    const targetUserId = resolveNotificationUserId(audience);
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unread') === 'true';
    const countOnly = searchParams.get('count') === 'true';

    const queryDb =
      targetUserId !== user.id ? createAdminClient(tenant.slug) : supabase;

    const retentionCutoff = notificationRetentionCutoff();

    if (countOnly) {
      let countQuery = queryDb
        .from('notifications')
        .select('id, type, read_at')
        .eq('user_id', targetUserId)
        .gte('created_at', retentionCutoff)
        .order('created_at', { ascending: false })
        .limit(50);
      if (unreadOnly) countQuery = countQuery.is('read_at', null);
      const { data: countRows, error: countError } = await countQuery;
      if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
      const filtered = filterNotificationsForAudience((countRows ?? []) as NotificationRow[], audience);
      const count = filtered.filter((n) => !n.read_at).length;
      return NextResponse.json({ count });
    }

    let query = queryDb
      .from('notifications')
      .select('id, type, title, body, data, read_at, created_at')
      .eq('user_id', targetUserId)
      .gte('created_at', retentionCutoff)
      .order('created_at', { ascending: false })
      .limit(50);
    if (unreadOnly) query = query.is('read_at', null);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const filtered = filterNotificationsForAudience((data ?? []) as NotificationRow[], audience);

    return NextResponse.json({ notifications: filtered });
  } catch (e) {
    console.error('Notifications GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const audience = await loadAudienceContext(tenant.slug, user.id);
    const targetUserId = resolveNotificationUserId(audience);
    const writeDb = targetUserId !== user.id ? createAdminClient(tenant.slug) : supabase;

    const body = await req.json().catch(() => ({})) as { id?: string; all?: boolean };
    const now = new Date().toISOString();

    if (body.all) {
      const { data: unreadRows, error: fetchError } = await writeDb
        .from('notifications')
        .select('id, type')
        .eq('user_id', targetUserId)
        .is('read_at', null);
      if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

      const idsToMark = filterNotificationsForAudience(
        (unreadRows ?? []) as NotificationRow[],
        audience
      ).map((n) => n.id);
      if (idsToMark.length === 0) return NextResponse.json({ success: true });

      const { error: updateError } = await writeDb
        .from('notifications')
        .update({ read_at: now })
        .in('id', idsToMark)
        .eq('user_id', targetUserId);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (body.id) {
      const { data: row, error: fetchError } = await writeDb
        .from('notifications')
        .select('id, type')
        .eq('id', body.id)
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
      if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      if (
        filterNotificationsForAudience([row as NotificationRow], audience).length === 0
      ) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const { error: updateError } = await writeDb
        .from('notifications')
        .update({ read_at: now })
        .eq('id', body.id)
        .eq('user_id', targetUserId);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Provide id or all' }, { status: 400 });
  } catch (e) {
    console.error('Notifications PATCH error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
