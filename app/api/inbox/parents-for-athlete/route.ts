import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { getCoachSessionMessageContacts } from '@/lib/coach-message-contacts';

/**
 * GET — parents and youth athletes this coach may DM:
 * anyone who has ever been registered on (or owned) one of their sessions.
 * Never other coaches.
 */
export async function GET() {
  try {
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (userData?.role !== 'coach' && userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Admin client so we always see full participant history for this coach's sessions
    const admin = createAdminClient(tenant.slug);
    const contacts = await getCoachSessionMessageContacts(admin, user.id);

    // Backward-compatible `parents` array for existing clients
    const parents = contacts
      .filter((c) => c.kind === 'parent')
      .map((c) => ({
        id: c.id,
        name: c.kids?.length ? `${c.name} (${c.kids.join(', ')})` : c.name,
        email: c.email,
        kids: c.kids,
      }));

    return NextResponse.json({ contacts, parents });
  } catch (e) {
    console.error('Parents for athlete GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
