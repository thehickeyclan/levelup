import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { createNotification } from '@/lib/notifications';

const TARGET_TYPES = new Set(['listing', 'thread', 'message', 'user', 'activity']);

/**
 * UGC report intake (App Store 1.2). Every report alerts all admins so
 * objectionable content is reviewed within 24 hours.
 */
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
      targetType?: string;
      targetId?: string;
      reason?: string;
    };
    const targetType = (body.targetType || '').trim();
    const targetId = (body.targetId || '').trim();
    const reason = (body.reason || '').trim().slice(0, 500);
    if (!TARGET_TYPES.has(targetType) || !targetId) {
      return NextResponse.json({ error: 'targetType and targetId are required' }, { status: 400 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: admins } = await admin.from('users').select('id').eq('role', 'admin');
    const reporter = user.email ?? user.id;
    for (const row of admins ?? []) {
      await createNotification(admin, {
        user_id: row.id as string,
        type: 'content_report',
        title: `Content report: ${targetType}`,
        body: `${reporter} reported a ${targetType}${reason ? ` — "${reason}"` : ''}. Review within 24 hours.`,
        data: { target_type: targetType, target_id: targetId, reported_by: user.id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('content report:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
