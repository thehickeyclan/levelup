import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { timeToHHmm } from '@/lib/availability';
import { notifyAvailabilityFollowers } from '@/lib/notify-availability-followers';
import { dbForCoachActor, resolveCoachActorId } from '@/lib/coach-actor-server';
import { coachHasFacility, getCoachFacilityIds, normalizeFacilityIdParam } from '@/lib/coach-facilities';

export async function GET() {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const actor = await resolveCoachActorId(supabase, user.id);
    if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status });

    const admin = createAdminClient(tenant.slug);
    const facilityIdList = await getCoachFacilityIds(admin, actor.coachId);
    const { data: facilityRows } =
      facilityIdList.length > 0
        ? await admin
            .from('facilities')
            .select('id, name, address, school')
            .in('id', facilityIdList)
            .order('name', { ascending: true })
        : { data: [] as { id: string; name: string; address?: string | null; school?: string }[] };

    const coachFacilities = facilityRows ?? [];

    const { data: rows, error } = await supabase
      .from('athlete_availability_slots')
      .select('id, slot_date, start_time, end_time, facility_id')
      .eq('athlete_id', actor.coachId)
      .gte('slot_date', new Date().toISOString().slice(0, 10))
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json({ availability: [], coachFacilities });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const availability = ((rows ?? []) as {
        id: string;
        slot_date: string;
        start_time: string;
        end_time: string;
        facility_id?: string | null;
      }[]).map((r) => ({
      id: r.id,
      slot_date: r.slot_date,
      start_time: timeToHHmm(r.start_time),
      end_time: timeToHHmm(r.end_time),
      facility_id: r.facility_id ?? null,
    }));

    return NextResponse.json({ availability, coachFacilities });
  } catch (e) {
    console.error('Availability me GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const actor = await resolveCoachActorId(supabase, user.id);
    if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status });

    const db = dbForCoachActor(tenant.slug, actor, supabase);

    const admin = createAdminClient(tenant.slug);

    const body = (await req.json()) as {
      slot_date: string;
      start_time: string;
      end_time: string;
      facilityId?: string | null | string;
    };
    const { slot_date, start_time, end_time, facilityId: rawFacilityFromBody } = body;

    if (!slot_date || typeof slot_date !== 'string') {
      return NextResponse.json({ error: 'Invalid slot_date' }, { status: 400 });
    }
    const slotDate = slot_date.slice(0, 10);
    const d = new Date(slotDate);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid slot_date' }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (slotDate < today) {
      return NextResponse.json({ error: 'slot_date must be today or in the future' }, { status: 400 });
    }
    if (!start_time || !end_time || typeof start_time !== 'string' || typeof end_time !== 'string') {
      return NextResponse.json({ error: 'Invalid start_time or end_time' }, { status: 400 });
    }

    const pad = (t: string) => {
      const s = t.trim();
      if (!s) return '09:00:00';
      const parts = s.split(':');
      const h = String(parseInt(parts[0] || '0', 10) || 0).padStart(2, '0');
      const m = String(parseInt(parts[1] || '0', 10) || 0).padStart(2, '0');
      const sec = parts[2] != null ? String(parseInt(parts[2], 10) || 0).padStart(2, '0') : '00';
      return `${h}:${m}:${sec}`;
    };
    const start = pad(start_time);
    const end = pad(end_time);

    let facilityRowId: string | null = null;
    if (rawFacilityFromBody != null && String(rawFacilityFromBody).trim() !== '') {
      facilityRowId = normalizeFacilityIdParam(rawFacilityFromBody);
      if (!facilityRowId) {
        return NextResponse.json({ error: 'Invalid facility' }, { status: 400 });
      }
      if (!(await coachHasFacility(admin, actor.coachId, facilityRowId))) {
        return NextResponse.json(
          {
            error:
              'Choose a facility linked to your profile (primary, secondary, or sites your admin assigned).',
          },
          { status: 400 }
        );
      }
    }

    let existingQuery = db
      .from('athlete_availability_slots')
      .select('id, slot_date, start_time, end_time, facility_id')
      .eq('athlete_id', actor.coachId)
      .eq('slot_date', slotDate)
      .eq('start_time', start);
    existingQuery =
      facilityRowId === null
        ? existingQuery.is('facility_id', null)
        : existingQuery.eq('facility_id', facilityRowId);
    const { data: existing } = await existingQuery.maybeSingle();

    const mapAvail = (r: {
      id: string;
      slot_date: string;
      start_time: string;
      end_time: string;
      facility_id?: string | null;
    }) => ({
      id: r.id,
      slot_date: r.slot_date,
      start_time: timeToHHmm(r.start_time),
      end_time: timeToHHmm(r.end_time),
      facility_id: r.facility_id ?? null,
    });

    if (existing) {
      const existingRow = existing as typeof existing & { facility_id?: string | null };
      const existingEnd =
        typeof existingRow.end_time === 'string'
          ? pad(existingRow.end_time)
          : pad(String(existingRow.end_time));
      if (existingEnd === end) {
        return NextResponse.json({
          availability: mapAvail(existingRow),
          duplicate: true,
        });
      }
      const { data: row, error: upErr } = await db
        .from('athlete_availability_slots')
        .update({ end_time: end })
        .eq('id', existingRow.id)
        .eq('athlete_id', actor.coachId)
        .select('id, slot_date, start_time, end_time, facility_id')
        .single();
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      if (!row) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
      notifyAvailabilityFollowers(tenant.slug, actor.coachId);
      return NextResponse.json({
        availability: mapAvail(row),
        updatedEnd: true,
      });
    }

    const { data: row, error } = await db
      .from('athlete_availability_slots')
      .insert({
        athlete_id: actor.coachId,
        slot_date: slotDate,
        start_time: start,
        end_time: end,
        facility_id: facilityRowId,
      })
      .select('id, slot_date, start_time, end_time, facility_id')
      .single();

    if (error) {
      if (error.code === '23505') {
        let againQuery = db
          .from('athlete_availability_slots')
          .select('id, slot_date, start_time, end_time, facility_id')
          .eq('athlete_id', actor.coachId)
          .eq('slot_date', slotDate)
          .eq('start_time', start);
        againQuery =
          facilityRowId === null
            ? againQuery.is('facility_id', null)
            : againQuery.eq('facility_id', facilityRowId);
        const { data: again } = await againQuery.maybeSingle();
        if (again) {
          return NextResponse.json({
            availability: mapAvail(again),
            duplicate: true,
          });
        }
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    notifyAvailabilityFollowers(tenant.slug, actor.coachId);

    return NextResponse.json({
      availability: mapAvail(row),
    });
  } catch (e) {
    console.error('Availability me POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const actor = await resolveCoachActorId(supabase, user.id);
    if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status });

    const db = dbForCoachActor(tenant.slug, actor, supabase);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { error } = await db
      .from('athlete_availability_slots')
      .delete()
      .eq('id', id)
      .eq('athlete_id', actor.coachId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    notifyAvailabilityFollowers(tenant.slug, actor.coachId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Availability me DELETE error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
