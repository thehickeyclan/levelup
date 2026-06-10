import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { createCoachLocation } from '@/lib/coach-create-location';
import { getCoachFacilityIds } from '@/lib/coach-facilities';

/** GET — facilities this coach can use for sessions. */
export async function GET() {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
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

    const coachId = user.id;
    const admin = createAdminClient(tenant.slug);
    const ids = await getCoachFacilityIds(admin, coachId);
    if (ids.length === 0) return NextResponse.json({ facilities: [] });

    const { data: facilities, error } = await admin
      .from('facilities')
      .select('id, name, school, address')
      .in('id', ids)
      .order('name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ facilities: facilities ?? [] });
  } catch (e) {
    console.error('Coach locations GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST — add a new location for this coach (available immediately, no admin approval). */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    const role = userData?.role;
    if (role !== 'coach' && role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      address?: string;
      directions?: string;
      coachId?: string;
    };

    let coachId = user.id;
    if (userData?.role === 'admin') {
      const raw = typeof body.coachId === 'string' ? body.coachId.trim() : '';
      if (!raw) {
        return NextResponse.json({ error: 'coachId is required for admin' }, { status: 400 });
      }
      coachId = raw;
    }

    const admin = createAdminClient(tenant.slug);
    const facility = await createCoachLocation(admin, coachId, {
      name: typeof body.name === 'string' ? body.name : '',
      address: typeof body.address === 'string' ? body.address : '',
      directions: typeof body.directions === 'string' ? body.directions : null,
    });

    return NextResponse.json({ facility });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not add location';
    const status = msg.includes('required') || msg.includes('address') ? 400 : 500;
    console.error('Coach locations POST error:', e);
    return NextResponse.json({ error: msg }, { status });
  }
}
