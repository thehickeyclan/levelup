import { redirect, notFound } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { formatEST } from '@/lib/format-date';
import { getCoachFacilitiesForEdit } from '@/lib/coach-facilities';
import { isScheduledSessionEditable } from '@/lib/session-editable';
import { EditSessionForm } from '@/app/(admin)/admin/sessions/[id]/edit/edit-session-form';
import { BackLink } from '@/components/back-link';

export const dynamic = 'force-dynamic';

export default async function CoachEditSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const cookieStore = await cookies();
  const viewAsCoachId =
    userData?.role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;

  if (userData?.role === 'admin' && !viewAsCoachId) {
    redirect(`/admin/sessions/${sessionId}/edit`);
  }

  if (userData?.role !== 'coach' && userData?.role !== 'admin') {
    redirect('/athlete-dashboard');
  }

  const admin = createAdminClient(tenant.slug);
  const { data: session, error } = await admin
    .from('sessions')
    .select(
      `
      id,
      scheduled_datetime,
      status,
      session_type,
      session_mode,
      focus_area,
      focus_area_2,
      join_policy,
      current_participants,
      max_participants,
      price_per_participant,
      duration_minutes,
      athlete_payment,
      athlete_payout_date,
      session_payout_rate,
      athlete_id,
      facility_id,
      athletes(id, first_name, last_name, school, payout_rate),
      facilities(id, name, school, address, directions),
      session_participants(amount_paid)
    `
    )
    .eq('id', sessionId)
    .single();

  if (error || !session) notFound();

  const athleteId = (session as { athlete_id?: string }).athlete_id;
  if (userData?.role === 'coach' && athleteId !== user.id) {
    redirect('/coach-sessions');
  }
  if (userData?.role === 'admin' && viewAsCoachId && athleteId !== viewAsCoachId) {
    redirect('/coach-sessions');
  }

  const coach = Array.isArray((session as { athletes?: unknown }).athletes)
    ? (session as { athletes: unknown[] }).athletes[0]
    : (session as { athletes?: { first_name?: string; last_name?: string; school?: string; payout_rate?: number | null } })
        .athletes;
  const fac = Array.isArray((session as { facilities?: unknown }).facilities)
    ? (session as { facilities: unknown[] }).facilities[0]
    : (session as { facilities?: { id?: string; name?: string; school?: string | null; address?: string | null; directions?: string | null } })
        .facilities;

  const partRows = (session as { session_participants?: { amount_paid?: number | null }[] }).session_participants;
  const participantAmountPaidSum = Array.isArray(partRows)
    ? partRows.reduce((sum, p) => sum + Number(p.amount_paid ?? 0), 0)
    : 0;

  const dbSessionType = (session as { session_type?: string }).session_type;
  const uiSessionType =
    dbSessionType === 'group'
      ? 'small_group'
      : dbSessionType === '2-athlete'
        ? 'partner'
        : dbSessionType === '1-on-1'
          ? 'private'
          : dbSessionType || 'small_group';

  const facilityId =
    (session as { facility_id?: string | null }).facility_id ??
    (fac as { id?: string } | null)?.id ??
    '';
  const ownerCoachId = athleteId ?? user.id;
  const facilities = await getCoachFacilitiesForEdit(admin, ownerCoachId, facilityId);
  const facRow = fac as {
    id?: string;
    name?: string;
    school?: string | null;
    address?: string | null;
    directions?: string | null;
  } | null;
  const currentFacility =
    facilityId && facRow
      ? {
          id: facilityId,
          name: facRow.name ?? 'Current location',
          school: facRow.school ?? null,
          address: facRow.address ?? null,
          directions: facRow.directions ?? null,
        }
      : null;
  const editable = isScheduledSessionEditable((session as { status?: string }).status ?? '');

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <div className="mb-4 -ml-2">
        <BackLink
          fallbackHref="/athlete-dashboard"
          label="Back to schedule"
          className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        />
      </div>
      <h1 className="text-xl font-bold mb-1">Edit session</h1>
      <p className="text-muted-foreground text-sm mb-5">
        {coach
          ? `${[(coach as { first_name?: string }).first_name, (coach as { last_name?: string }).last_name].filter(Boolean).join(' ').trim()}`.trim()
          : '—'}
        {(fac as { name?: string })?.name ? ` · ${(fac as { name?: string }).name}` : ''}
      </p>
      <EditSessionForm
        formMode="coach"
        sessionId={sessionId}
        sessionStatus={(session as { status?: string }).status}
        sessionType={uiSessionType}
        focusArea={(session as { focus_area?: string | null }).focus_area ?? ''}
        focusArea2={(session as { focus_area_2?: string | null }).focus_area_2 ?? ''}
        joinPolicy={
          ((session as { join_policy?: string }).join_policy as 'public' | 'private' | 'invite_only') ?? 'private'
        }
        maxParticipants={(session as { max_participants?: number }).max_participants ?? 6}
        pricePerParticipant={(session as { price_per_participant?: number }).price_per_participant ?? 0}
        currentParticipants={(session as { current_participants?: number }).current_participants ?? 0}
        athletePayment={
          (session as { athlete_payment?: number | null }).athlete_payment != null
            ? Number((session as { athlete_payment?: number | null }).athlete_payment)
            : null
        }
        athletePayoutDate={(session as { athlete_payout_date?: string | null }).athlete_payout_date ?? null}
        participantAmountPaidSum={participantAmountPaidSum}
        sessionPayoutRate={(session as { session_payout_rate?: number | null }).session_payout_rate ?? null}
        coachPayoutRate={
          coach && (coach as { payout_rate?: number | null }).payout_rate != null
            ? Number((coach as { payout_rate?: number | null }).payout_rate)
            : null
        }
        scheduledDate={formatEST((session as { scheduled_datetime?: string }).scheduled_datetime ?? '', 'yyyy-MM-dd')}
        scheduledTime={formatEST((session as { scheduled_datetime?: string }).scheduled_datetime ?? '', 'HH:mm')}
        durationMinutes={(session as { duration_minutes?: number }).duration_minutes ?? 60}
        facilityId={facilityId}
        facilities={facilities}
        currentFacility={currentFacility}
        coachId={ownerCoachId}
        editable={editable}
      />
    </div>
  );
}
