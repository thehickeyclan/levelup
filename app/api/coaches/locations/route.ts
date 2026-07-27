import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { createCoachLocation } from '@/lib/coach-create-location';
import { ensureCoachFacilityLinked, getCoachFacilitiesForEdit } from '@/lib/coach-facilities';

/** GET — facilities this coach can use for sessions. Optional `coachId` for admin. */
export async function GET(req: NextRequest) {
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

    const requestedCoachId = req.nextUrl.searchParams.get('coachId')?.trim() || '';
    let coachId = user.id;
    if (requestedCoachId) {
      if (role !== 'admin' && requestedCoachId !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      coachId = requestedCoachId;
    }

    const admin = createAdminClient(tenant.slug);
    const facilities = await getCoachFacilitiesForEdit(admin, coachId);
    return NextResponse.json({ facilities });
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

/** PATCH — make one of this coach's saved facilities the default. */
export async function PATCH(req: NextRequest) {
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
      coachId?: string;
      facilityId?: string;
    };
    const facilityId = body.facilityId?.trim();
    if (!facilityId) return NextResponse.json({ error: 'facilityId is required' }, { status: 400 });

    const coachId =
      role === 'admin' ? body.coachId?.trim() : user.id;
    if (!coachId) return NextResponse.json({ error: 'coachId is required for admin' }, { status: 400 });

    const admin = createAdminClient(tenant.slug);
    const { data: facility } = await admin
      .from('facilities')
      .select('id')
      .eq('id', facilityId)
      .maybeSingle();
    if (!facility) return NextResponse.json({ error: 'Location not found' }, { status: 404 });

    await ensureCoachFacilityLinked(admin, coachId, facilityId);
    const { error } = await admin
      .from('athletes')
      .update({ facility_id: facilityId })
      .eq('id', coachId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, facilityId });
  } catch (e) {
    console.error('Coach locations PATCH error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
