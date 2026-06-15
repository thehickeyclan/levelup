import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { easternWallDateTimeToUtcIso } from '@/lib/format-date';
import {
  clearSessionSmsAlerts,
  isSessionAlertable,
  notifySessionScheduledFollowers,
} from '@/lib/notify-session-scheduled-followers';
import { COACH_SESSION_OVERLAP_ERROR, findCoachSessionTimeOverlap } from '@/lib/coach-session-overlap';
import { normalizeFacilityIdParam, ensureCoachFacilityLinked } from '@/lib/coach-facilities';
import { isScheduledSessionEditable, SESSION_NOT_EDITABLE_ERROR } from '@/lib/session-editable';
import {
  notifyParentsSessionFacilityChange,
  notifyParentsSessionTimeChange,
} from '@/lib/notify-session-reschedule';

/**
 * PATCH - Admin updates a session (focus_area, join_policy, max_participants, price_per_participant).
 * Only allowed for scheduled sessions.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    const isAdmin = userData?.role === 'admin';
    const isCoach = userData?.role === 'coach';
    if (!isAdmin && !isCoach) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let body: {
      session_type?: 'small_group' | 'partner' | 'private';
      focus_area?: string | null;
      focus_area_2?: string | null;
      join_policy?: 'public' | 'private' | 'invite_only';
      max_participants?: number;
      price_per_participant?: number;
      scheduledDate?: string;
      scheduledTime?: string;
      duration_minutes?: number;
      facility_id?: string | null;
      published?: boolean;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const admin = createAdminClient(tenant.slug);

    const { data: session, error: fetchErr } = await admin
      .from('sessions')
      .select(
        `
        id,
        status,
        session_type,
        athlete_id,
        parent_id,
        scheduled_datetime,
        partner_invite_code,
        join_policy,
        duration_minutes,
        current_participants,
        facility_id,
        facilities(name),
        athletes(first_name, last_name)
      `
      )
      .eq('id', sessionId)
      .single();
    
    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const coachOwnsSession = isCoach && session.athlete_id === user.id;
    if (!isAdmin && !coachOwnsSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Cancelled sessions cannot be edited' },
        { status: 400 }
      );
    }

    if (isCoach && !isScheduledSessionEditable(session.status)) {
      return NextResponse.json({ error: SESSION_NOT_EDITABLE_ERROR }, { status: 400 });
    }

    const coachRow = session.athletes as
      | { first_name?: string | null; last_name?: string | null }
      | { first_name?: string | null; last_name?: string | null }[]
      | null;
    const coachOne = Array.isArray(coachRow) ? coachRow[0] : coachRow;
    const coachName = coachOne
      ? [coachOne.first_name, coachOne.last_name].filter(Boolean).join(' ').trim() || 'Coach'
      : 'Coach';
    const facRow = session.facilities as { name?: string } | { name?: string }[] | null;
    const facOne = Array.isArray(facRow) ? facRow[0] : facRow;
    const previousFacilityName = facOne?.name?.trim() || '—';

    const updates: Record<string, unknown> = {};
    if (body.session_type !== undefined && ['small_group', 'partner', 'private'].includes(body.session_type)) {
      // Map UI values to DB constraint values: '1-on-1', '2-athlete', 'group'
      updates.session_type = body.session_type === 'small_group' ? 'group' : body.session_type === 'partner' ? '2-athlete' : '1-on-1';
      // Also update session_mode based on type
      updates.session_mode = body.session_type === 'private' ? 'private' : 'partner-invite';
    }
    if (body.focus_area !== undefined) {
      updates.focus_area = body.focus_area === '' || body.focus_area == null
        ? null
        : String(body.focus_area).trim() || null;
    }
    if (body.focus_area_2 !== undefined) {
      updates.focus_area_2 = body.focus_area_2 === '' || body.focus_area_2 == null
        ? null
        : String(body.focus_area_2).trim() || null;
    }
    if (body.join_policy !== undefined) {
      if (['public', 'private', 'invite_only'].includes(body.join_policy)) {
        updates.join_policy = body.join_policy;
      }
    }
    if (body.max_participants !== undefined) {
      let max = Math.min(20, Math.max(1, Number(body.max_participants) || 2));
      const effectiveType =
        body.session_type !== undefined
          ? body.session_type === 'small_group'
            ? 'group'
            : body.session_type === 'partner'
              ? '2-athlete'
              : '1-on-1'
          : session.session_type;
      if (effectiveType === '2-athlete') {
        max = 2;
      }
      const enrolled = Number(session.current_participants) || 0;
      if (max < enrolled) {
        return NextResponse.json(
          { error: `Max participants cannot be less than ${enrolled} already registered` },
          { status: 400 }
        );
      }
      updates.max_participants = max;
    }
    if (body.session_type === 'partner') {
      updates.max_participants = 2;
    }
    if (body.price_per_participant !== undefined) {
      const price = Math.max(0, Number(body.price_per_participant) ?? 0);
      updates.price_per_participant = price;
    }
    if (body.duration_minutes !== undefined) {
      const duration = Number(body.duration_minutes);
      if (![45, 60, 90].includes(duration)) {
        return NextResponse.json({ error: 'Duration must be 45, 60, or 90 minutes' }, { status: 400 });
      }
      updates.duration_minutes = duration;
    }
    if (body.facility_id !== undefined) {
      const fid = normalizeFacilityIdParam(body.facility_id);
      if (!fid) {
        // Omit or null — keep existing facility (e.g. form did not load facility_id)
      } else {
        if (isCoach) {
          const { data: fac } = await admin.from('facilities').select('id').eq('id', fid).maybeSingle();
          if (!fac) {
            return NextResponse.json({ error: 'Facility not found' }, { status: 400 });
          }
          await ensureCoachFacilityLinked(admin, session.athlete_id, fid);
        } else {
          const { data: fac } = await admin.from('facilities').select('id').eq('id', fid).maybeSingle();
          if (!fac) {
            return NextResponse.json({ error: 'Facility not found' }, { status: 400 });
          }
        }
        updates.facility_id = fid;
      }
    }

    let newScheduledIso: string | null = null;
    if (body.scheduledDate && body.scheduledTime) {
      const newIso = easternWallDateTimeToUtcIso(body.scheduledDate, body.scheduledTime);
      const newDt = new Date(newIso);
      if (Number.isNaN(newDt.getTime())) {
        return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 });
      }
      newScheduledIso = newIso;
      updates.scheduled_datetime = newIso;
    }

    const effectiveDuration =
      (updates.duration_minutes as number | undefined) ?? session.duration_minutes;
    const effectiveStartIso =
      newScheduledIso ?? (session.scheduled_datetime as string);
    const scheduleChanged =
      newScheduledIso != null ||
      (body.duration_minutes !== undefined &&
        body.duration_minutes !== session.duration_minutes);

    if (scheduleChanged && effectiveStartIso) {
      try {
        const conflict = await findCoachSessionTimeOverlap(admin, {
          coachAthleteId: session.athlete_id,
          scheduledStartIso: effectiveStartIso,
          durationMinutes: effectiveDuration,
          excludeSessionId: sessionId,
        });
        if (conflict) {
          return NextResponse.json({ error: COACH_SESSION_OVERLAP_ERROR }, { status: 409 });
        }
      } catch (overlapErr) {
        console.error('[admin session PATCH] coach overlap check', overlapErr);
        return NextResponse.json({ error: 'Could not verify schedule availability' }, { status: 500 });
      }
    }
    
    const prevJoinPolicy = (session.join_policy as string | null) ?? 'private';
    const nextJoinPolicy =
      (updates.join_policy as string | undefined) ?? prevJoinPolicy;
    const becamePublic =
      nextJoinPolicy === 'public' && prevJoinPolicy !== 'public';
    const leftPublic =
      prevJoinPolicy === 'public' && nextJoinPolicy !== 'public';
    const publishedFlag = body.published === true;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true });
    }

    updates.updated_at = new Date().toISOString();

    const { error: updateErr } = await admin
      .from('sessions')
      .update(updates)
      .eq('id', sessionId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const previousIso = session.scheduled_datetime as string;
    if (newScheduledIso && newScheduledIso !== previousIso) {
      void notifyParentsSessionTimeChange(admin, {
        sessionId,
        athleteId: session.athlete_id as string,
        parentId: (session.parent_id as string | null) ?? null,
        coachName,
        previousIso,
        newIso: newScheduledIso,
        excludeUserId: user.id,
      });
    }

    if (body.facility_id !== undefined && updates.facility_id !== session.facility_id) {
      const newFid = updates.facility_id as string;
      const { data: newFac } = await admin.from('facilities').select('name').eq('id', newFid).maybeSingle();
      void notifyParentsSessionFacilityChange(admin, {
        sessionId,
        coachName,
        previousFacilityName,
        newFacilityName: (newFac as { name?: string } | null)?.name?.trim() || '—',
        excludeUserId: user.id,
        parentId: (session.parent_id as string | null) ?? null,
      });
    }

    if (leftPublic) {
      await clearSessionSmsAlerts(admin, sessionId);
    }

    const shouldNotifyFollowers =
      session.athlete_id &&
      isSessionAlertable(nextJoinPolicy, session.status as string) &&
      (becamePublic || publishedFlag);

    if (shouldNotifyFollowers) {
      void notifySessionScheduledFollowers(tenant.slug, session.athlete_id as string, {
        sessionId,
        scheduledDatetime: (updates.scheduled_datetime as string) || (session.scheduled_datetime as string),
        joinUrlPath: `/join/${session.partner_invite_code}`,
      });
    }
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Admin session PATCH error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE - Permanently deletes a session (participants removed via CASCADE).
 * Allowed statuses: scheduled, cancelled, no-show. Completed sessions stay undeletable here.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const headersList = await headers();
    const tenant = getTenantFromRequestHeaders(headersList);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    const isAdmin = userData?.role === 'admin';
    const isCoach = userData?.role === 'coach';
    if (!isAdmin && !isCoach) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const admin = createAdminClient(tenant.slug);
    const { data: session, error: fetchErr } = await admin
      .from('sessions')
      .select('id, status, athlete_id, current_participants')
      .eq('id', sessionId)
      .single();

    if (fetchErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const coachOwnsSession = isCoach && session.athlete_id === user.id;
    if (!isAdmin && !coachOwnsSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deletableStatuses = new Set(['scheduled', 'cancelled', 'no-show']);
    if (!deletableStatuses.has(session.status)) {
      return NextResponse.json(
        { error: 'Only scheduled, cancelled, or no-show sessions can be deleted' },
        { status: 400 }
      );
    }

    if (!isAdmin) {
      const { data: participants, error: partErr } = await admin
        .from('session_participants')
        .select('paid, stripe_payment_intent_id')
        .eq('session_id', sessionId);
      if (partErr) {
        return NextResponse.json({ error: 'Could not verify participants' }, { status: 500 });
      }
      const hasCommittedPayment = (participants ?? []).some(
        (p) =>
          p.paid === true ||
          (typeof p.stripe_payment_intent_id === 'string' && p.stripe_payment_intent_id.length > 0)
      );
      if (hasCommittedPayment) {
        return NextResponse.json(
          {
            error:
              'This session has paid registrations. Cancel it from your session list instead of deleting.',
          },
          { status: 400 }
        );
      }
    }

    const { error: deleteErr } = await admin.from('sessions').delete().eq('id', sessionId);
    if (deleteErr) {
      console.error('Admin session DELETE error:', deleteErr);
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Admin session DELETE error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
