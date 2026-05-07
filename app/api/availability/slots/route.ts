import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { type AvailabilitySlot } from '@/lib/availability';
import { mergeSlotsWithFacilities } from '@/lib/availability-slots-with-facility';
import { formatEST } from '@/lib/format-date';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const athleteId = searchParams.get('athleteId');
    const dateParam = searchParams.get('date');
    const excludeSessionId = searchParams.get('excludeSessionId'); // e.g. when rescheduling, exclude current session
    if (!athleteId || !dateParam) {
      return NextResponse.json({ error: 'Missing athleteId or date' }, { status: 400 });
    }

    const d = new Date(dateParam);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }

    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const supabase = await createClient(tenant.slug);
    const admin = createAdminClient(tenant.slug);
    const dateOnly = dateParam.split('T')[0];

    const { data: blockRow } = await admin
      .from('athlete_availability_blocks')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('blocked_date', dateOnly)
      .maybeSingle();

    if (blockRow) {
      return NextResponse.json({ slots: [] });
    }

    // Date-specific slots for this date
    const { data: dateRows } = await supabase
      .from('athlete_availability_slots')
      .select('slot_date, start_time, end_time, facility_id')
      .eq('athlete_id', athleteId)
      .eq('slot_date', dateOnly);

    // Legacy recurring slots
    const { data: availRows } = await supabase
      .from('athlete_availability')
      .select('day_of_week, start_time, end_time')
      .eq('athlete_id', athleteId);

    const availability: AvailabilitySlot[] = (availRows || []).map(
      (r: { day_of_week: number; start_time: string; end_time: string }) => ({
        day_of_week: r.day_of_week,
        start_time: r.start_time,
        end_time: r.end_time,
      })
    );

    const dayOfWeek = d.getDay();

    const mergedTimed = mergeSlotsWithFacilities(
      (dateRows ?? []) as Parameters<typeof mergeSlotsWithFacilities>[0],
      availability,
      dateOnly,
      dayOfWeek
    );

    const allSlots = [...new Set(mergedTimed.map((s) => s.time))].sort();

    if (allSlots.length === 0) {
      return NextResponse.json({ slots: [] });
    }

    const dayStart = `${dateOnly}T00:00:00`;
    const dayEnd = `${dateOnly}T23:59:59`;

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, scheduled_datetime')
      .eq('athlete_id', athleteId)
      .in('status', ['scheduled', 'completed'])
      .gte('scheduled_datetime', dayStart)
      .lte('scheduled_datetime', dayEnd);

    const booked = new Set<string>();
    for (const s of sessions || []) {
      const row = s as { id?: string; scheduled_datetime: string };
      if (excludeSessionId && row.id === excludeSessionId) continue;
      const t = row.scheduled_datetime;
      const [, timePart] = t.split('T');
      const [h, m] = (timePart || '').split(':').map((x) => parseInt(x, 10) || 0);
      booked.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }

    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { data: holdRows } = await admin
      .from('parent_session_requests')
      .select('preferred_datetime, duration_minutes')
      .eq('coach_id', athleteId)
      .eq('status', 'pending')
      .gte('created_at', twoHoursAgo);

    for (const hrow of holdRows || []) {
      const pd = (hrow as { preferred_datetime?: string | null }).preferred_datetime;
      if (!pd) continue;
      if (formatEST(new Date(pd), 'yyyy-MM-dd') !== dateOnly) continue;
      const dur = Number((hrow as { duration_minutes?: number }).duration_minutes) || 60;
      const start = formatEST(new Date(pd), 'HH:mm');
      const [sh, sm] = start.split(':').map((x) => parseInt(x, 10) || 0);
      let m0 = sh * 60 + sm;
      const endM = m0 + dur;
      while (m0 < endM) {
        const hh = Math.floor(m0 / 60) % 24;
        const mm = m0 % 60;
        booked.add(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
        m0 += 60;
      }
    }

    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const currentHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const openTimes = new Set(
      mergedTimed.filter((s) => {
        if (booked.has(s.time)) return false;
        if (isToday && s.time <= currentHHmm) return false;
        return true;
      }).map((s) => s.time)
    );

    const slots = mergedTimed
      .filter((s) => openTimes.has(s.time))
      .reduce<Array<{ time: string; facilityId: string | null }>>((acc, s) => {
        acc.push({ time: s.time, facilityId: s.facilityId });
        return acc;
      }, []);

    return NextResponse.json({ slots });
  } catch (e) {
    console.error('Availability slots API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
