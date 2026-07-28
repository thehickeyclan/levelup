import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { getEffectiveFilledCountWithListedNames } from '@/lib/sessions';
import {
  buildSessionRosterParticipant,
} from '@/lib/wrestler-roster-display';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';

type ParticipantRow = {
  id?: string;
  status?: string | null;
  paid?: boolean | null;
  attendance_status?: 'attended' | 'no_show' | null;
  youth_wrestler_id?: string | null;
  roster_first_name?: string | null;
  roster_last_name?: string | null;
  youth_wrestlers?:
    | {
        first_name?: string;
        last_name?: string;
        age?: number | null;
        weight_class?: string | null;
        skill_level?: string | null;
        graduation_year?: number | null;
      }
    | {
        first_name?: string;
        last_name?: string;
        age?: number | null;
        weight_class?: string | null;
        skill_level?: string | null;
        graduation_year?: number | null;
      }[]
    | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Parent app: session detail + roster (mirrors web /sessions/[id]). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient(tenant.slug);
    const sessionFields = `
        id,
        scheduled_datetime,
        duration_minutes,
        status,
        session_type,
        focus_area,
        focus_area_2,
        join_policy,
        current_participants,
        max_participants,
        price_per_participant,
        total_price,
        location_visibility,
        athletes(id, first_name, last_name, school, photo_url, average_rating, review_count),
        facilities(id, name, address),
        session_participants(id, status, paid, attendance_status, youth_wrestler_id, roster_first_name, roster_last_name, youth_wrestlers(first_name, last_name, age, weight_class, skill_level, graduation_year))
      `;
    const withoutAttendance = sessionFields
      .replace(
        'id, status, paid, attendance_status, youth_wrestler_id',
        'id, status, paid, youth_wrestler_id'
      );
    const fieldCandidates = [
      sessionFields,
      withoutAttendance,
      sessionFields.replace(/\s*location_visibility,\s*/, '\n'),
      withoutAttendance.replace(/\s*location_visibility,\s*/, '\n'),
    ];
    let sessionResult = await admin
      .from('sessions')
      .select(fieldCandidates[0])
      .eq('id', sessionId)
      .maybeSingle();

    for (const fields of fieldCandidates.slice(1)) {
      if (!sessionResult.error) break;
      const schemaError =
        sessionResult.error.code === 'PGRST204' ||
        /location_visibility|attendance_status/i.test(sessionResult.error.message);
      if (!schemaError) break;
      sessionResult = await admin
        .from('sessions')
        .select(fields)
        .eq('id', sessionId)
        .maybeSingle() as typeof sessionResult;
    }

    if (sessionResult.error) {
      console.error('mobile session GET:', sessionResult.error);
      return NextResponse.json({ error: sessionResult.error.message }, { status: 500 });
    }
    const session = sessionResult.data as unknown as {
      id: string;
      scheduled_datetime: string;
      duration_minutes: number | null;
      status: string;
      session_type: string | null;
      focus_area: string | null;
      focus_area_2: string | null;
      join_policy: string | null;
      current_participants: number | null;
      max_participants: number | null;
      price_per_participant: number | null;
      total_price: number | null;
      location_visibility?: string | null;
      athletes:
        | {
            id: string;
            first_name: string;
            last_name: string;
            school: string | null;
            photo_url: string | null;
            average_rating: number | null;
            review_count: number | null;
          }
        | Array<{
            id: string;
            first_name: string;
            last_name: string;
            school: string | null;
            photo_url: string | null;
            average_rating: number | null;
            review_count: number | null;
          }>
        | null;
      facilities:
        | { id: string; name: string; address: string | null }
        | Array<{ id: string; name: string; address: string | null }>
        | null;
      session_participants?: ParticipantRow[];
    } | null;
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const participants = ((session.session_participants ?? []) as ParticipantRow[]).filter(
      (participant) => participant.status !== 'cancelled'
    );
    const roster = participants
      .map((p, index) => {
        const yw = unwrapOne(p.youth_wrestlers);
        const display = buildSessionRosterParticipant(
          yw
            ? {
                first_name: yw.first_name,
                last_name: yw.last_name,
                age: yw.age,
                weight_class: yw.weight_class,
                skill_level: yw.skill_level,
                graduation_year: yw.graduation_year,
              }
            : { first_name: p.roster_first_name, last_name: p.roster_last_name }
        );
        return {
          ...(display ?? { name: `Athlete ${index + 1}` }),
          participantId: p.id,
          paid: p.paid ?? null,
          attendanceStatus: p.attendance_status ?? null,
        };
      })
      .filter((r) => Boolean(r.participantId));

    const max = session.max_participants ?? 1;
    const filled = getEffectiveFilledCountWithListedNames(
      {
        current_participants: session.current_participants,
        max_participants: session.max_participants,
        session_participants: participants,
      },
      roster.length
    );

    const coach = unwrapOne(session.athletes);
    const rawFacility = unwrapOne(session.facilities);
    const locationVisibility =
      (session as { location_visibility?: string | null }).location_visibility ?? 'public';
    let canRevealAddress = locationVisibility !== 'participants_only';
    if (!canRevealAddress) {
      const [{ data: userRow }, householdWrestlerIds] = await Promise.all([
        admin.from('users').select('role').eq('id', user.id).maybeSingle(),
        getParentYouthWrestlerIds(admin, user.id),
      ]);
      const participantIds = new Set(
        participants
          .map((participant) => participant.youth_wrestler_id)
          .filter((value): value is string => Boolean(value))
      );
      canRevealAddress =
        userRow?.role === 'admin' ||
        coach?.id === user.id ||
        participantIds.has(user.id) ||
        householdWrestlerIds.some((wrestlerId) => participantIds.has(wrestlerId));
    }
    const facility = rawFacility
      ? {
          ...rawFacility,
          address: canRevealAddress ? rawFacility.address : null,
          address_hidden: !canRevealAddress,
        }
      : null;

    return NextResponse.json({
      session: {
        id: session.id,
        scheduled_datetime: session.scheduled_datetime,
        duration_minutes: session.duration_minutes,
        status: session.status,
        session_type: session.session_type,
        focus_area: session.focus_area,
        focus_area_2: session.focus_area_2,
        join_policy: session.join_policy,
        max_participants: session.max_participants,
        price_per_participant: session.price_per_participant,
        total_price: session.total_price,
        filled_count: filled,
        openings: Math.max(0, max - filled),
        coach,
        facility,
      },
      roster,
    });
  } catch (e) {
    console.error('mobile session:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
