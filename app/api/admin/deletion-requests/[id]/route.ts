import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { getAccountFootprint, isZeroFootprint } from '@/lib/account-deletion';

/**
 * Works one account-deletion request (App Store 5.1.1(v)).
 *
 * - purge: permanent removal for zero-footprint accounts. Explicit deletes of
 *   the athletes and users rows, then a hard auth delete (the precedent manual
 *   deletion used the same three deletes).
 * - anonymize: for accounts with history. Strips personal data from users /
 *   athletes / owned youth_wrestlers, then SOFT-deletes the auth user.
 *   A hard auth delete is not possible here: public.users cascades from
 *   auth.users, and sessions cascade from public.users, so it would destroy
 *   the financial/session records this path exists to preserve.
 * - cancel: lifts the login ban and closes the request (accidental taps).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action;
    if (action !== 'purge' && action !== 'anonymize' && action !== 'cancel') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const admin = createAdminClient(tenant.slug);
    const { data: request, error: requestError } = await admin
      .from('account_deletion_requests')
      .select('id, user_id, email, status')
      .eq('id', id)
      .maybeSingle();
    if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });
    if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Request is already completed' }, { status: 409 });
    }
    const targetId = request.user_id as string;
    if (targetId === user.id) {
      return NextResponse.json({ error: 'Cannot act on your own account' }, { status: 400 });
    }

    const notes: string[] = [];

    if (action === 'cancel') {
      const { error: unbanError } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: 'none',
      });
      if (unbanError && !/not found/i.test(unbanError.message)) {
        return NextResponse.json({ error: `Could not lift ban: ${unbanError.message}` }, { status: 500 });
      }
      notes.push(unbanError ? 'auth user already gone; nothing to unban' : 'login ban lifted');
    }

    if (action === 'purge') {
      // Re-verify server-side: purge is only for zero-footprint accounts.
      const footprint = await getAccountFootprint(admin, targetId);
      if (!isZeroFootprint(footprint)) {
        return NextResponse.json(
          { error: 'Account has history (sessions, orders, threads, or credits). Use anonymize instead.', footprint },
          { status: 409 }
        );
      }

      const { error: athleteError } = await admin.from('athletes').delete().eq('id', targetId);
      if (athleteError) {
        return NextResponse.json({ error: `athletes delete: ${athleteError.message}` }, { status: 500 });
      }
      const { error: usersError } = await admin.from('users').delete().eq('id', targetId);
      if (usersError) {
        return NextResponse.json({ error: `users delete: ${usersError.message}` }, { status: 500 });
      }
      const { error: authError } = await admin.auth.admin.deleteUser(targetId);
      if (authError && !/not found/i.test(authError.message)) {
        return NextResponse.json({ error: `auth delete: ${authError.message}` }, { status: 500 });
      }
      notes.push('purged: athletes row, users row, auth user deleted');
    }

    if (action === 'anonymize') {
      const placeholderEmail = `deleted-${targetId}@anonymized.invalid`;

      const { error: usersError } = await admin
        .from('users')
        .update({
          first_name: 'Deleted',
          last_name: 'User',
          email: placeholderEmail,
          phone: null,
          zip_code: null,
          archived_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId);
      if (usersError) {
        return NextResponse.json({ error: `users anonymize: ${usersError.message}` }, { status: 500 });
      }
      notes.push('users row anonymized');

      const { error: athleteError } = await admin
        .from('athletes')
        .update({
          first_name: 'Deleted',
          last_name: 'User',
          bio: null,
          photo_url: null,
          venmo_handle: null,
          zelle_email: null,
          active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId);
      if (athleteError) console.error('anonymize athletes:', athleteError.message);
      else notes.push('athlete profile anonymized');

      // Kids owned by this parent (kids linked to other active parents keep their data).
      const { error: kidsError } = await admin
        .from('youth_wrestlers')
        .update({
          first_name: 'Deleted',
          last_name: 'User',
          photo_url: null,
          medical_notes: null,
          date_of_birth: null,
          active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('parent_id', targetId);
      if (kidsError) console.error('anonymize youth_wrestlers:', kidsError.message);
      else notes.push('owned youth wrestlers anonymized');

      // Scrub personal data from auth, then SOFT-delete so FK cascades never
      // fire and session/financial history survives. Login stays impossible.
      const { error: scrubError } = await admin.auth.admin.updateUserById(targetId, {
        email: placeholderEmail,
        user_metadata: {},
      });
      if (scrubError && !/not found/i.test(scrubError.message)) {
        console.error('anonymize auth scrub:', scrubError.message);
      }
      const { error: authError } = await admin.auth.admin.deleteUser(targetId, true);
      if (authError && !/not found/i.test(authError.message)) {
        return NextResponse.json({ error: `auth soft delete: ${authError.message}` }, { status: 500 });
      }
      notes.push('auth login removed (soft delete — records preserved)');
    }

    const status = action === 'purge' ? 'purged' : action === 'anonymize' ? 'anonymized' : 'cancelled';
    const { error: closeError } = await admin
      .from('account_deletion_requests')
      .update({
        status,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        notes: notes.join('; '),
      })
      .eq('id', id);
    if (closeError) {
      // The account work succeeded; surface the bookkeeping failure loudly.
      return NextResponse.json(
        { error: `Account handled, but the request could not be marked complete: ${closeError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, status, notes });
  } catch (e) {
    console.error('Admin deletion request error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
