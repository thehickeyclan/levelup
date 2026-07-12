import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tenants } from '@/config/tenants';
import { NOTIFICATION_RETENTION_DAYS } from '@/lib/notification-retention';
import { purgeOldNotifications } from '@/lib/purge-old-notifications';

/**
 * Daily cron: delete in-app notifications older than NOTIFICATION_RETENTION_DAYS.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (process.env.NODE_ENV === 'production') {
    const ok = secret && (auth === `Bearer ${secret}` || querySecret === secret);
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const byTenant: Record<string, number> = {};
  let deleted = 0;

  for (const slug of Object.keys(tenants)) {
    try {
      const admin = createAdminClient(slug);
      const n = await purgeOldNotifications(admin);
      byTenant[slug] = n;
      deleted += n;
    } catch (e) {
      console.error(`purge-old-notifications tenant ${slug}:`, e);
      byTenant[slug] = 0;
    }
  }

  return NextResponse.json({
    ok: true,
    retentionDays: NOTIFICATION_RETENTION_DAYS,
    deleted,
    byTenant,
  });
}
