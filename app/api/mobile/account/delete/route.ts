import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { createNotification } from '@/lib/notifications';

/**
 * In-app account deletion (App Store 5.1.1(v)). Immediately locks the account
 * (permanent ban — login impossible), then admins complete data removal within
 * 30 days. Order/booking history involving other families is retained per policy.
 */
export async function POST() {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient(tenant.slug);

    const { error: banError } = await admin.auth.admin.updateUserById(user.id, {
      ban_duration: '876000h',
    });
    if (banError) {
      console.error('account delete ban:', banError);
      return NextResponse.json({ error: 'Could not process the request — try again.' }, { status: 500 });
    }

    // Persist to the admin work queue (/admin/compliance). Tolerates the
    // table not existing yet — migrations are hand-applied to production.
    try {
      const { data: existing, error: queueReadError } = await admin
        .from('account_deletion_requests')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();
      if (queueReadError) {
        console.error('account delete queue read:', queueReadError.message);
      } else if (!existing) {
        const { data: profile } = await admin
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        const { error: queueInsertError } = await admin.from('account_deletion_requests').insert({
          user_id: user.id,
          email: user.email ?? '',
          role: (profile as { role?: string } | null)?.role ?? null,
          tenant_slug: tenant.slug,
        });
        if (queueInsertError) console.error('account delete queue insert:', queueInsertError.message);
      }
    } catch (queueError) {
      console.error('account delete queue:', queueError);
    }

    // Alert every admin so data removal is completed within the stated window.
    const { data: admins } = await admin.from('users').select('id').eq('role', 'admin');
    const requesterLabel = user.email ?? user.id;
    for (const row of admins ?? []) {
      await createNotification(admin, {
        user_id: row.id as string,
        type: 'account_deletion_request',
        title: 'Account deletion requested',
        body: `${requesterLabel} requested account deletion from the app. Complete data removal within 30 days.`,
        data: { requested_by: user.id },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('account delete:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
