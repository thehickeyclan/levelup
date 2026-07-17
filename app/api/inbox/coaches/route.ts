import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';

/** GET - list all coaches (athletes) so parent can start a DM with any. */
export async function GET() {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (
      userData?.role !== 'parent' &&
      userData?.role !== 'youth_wrestler' &&
      userData?.role !== 'admin'
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: athletes, error } = await supabase
      .from('athletes')
      .select('id, first_name, last_name, school, photo_url')
      .eq('active', true)
      .order('school', { ascending: true })
      .order('first_name', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const coaches = (athletes ?? []).map((a) => ({
      id: a.id,
      firstName: a.first_name ?? '',
      lastName: a.last_name ?? '',
      school: a.school ?? '',
      photoUrl: a.photo_url ?? undefined,
    }));

    return NextResponse.json({ coaches });
  } catch (e) {
    console.error('Inbox coaches GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
