import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { RescheduleClient } from './reschedule-client';
import { isSessionEditableBeforeStart } from '@/lib/session-editable';

export default async function ReschedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) notFound();

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=' + encodeURIComponent(`/sessions/${sessionId}/reschedule`));
  }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'parent' && userData?.role !== 'admin' && userData?.role !== 'coach') {
    redirect('/dashboard');
  }

  const admin = createAdminClient(tenant.slug);
  const { data: session, error } = await admin
    .from('sessions')
    .select(`
      id,
      parent_id,
      athlete_id,
      scheduled_datetime,
      status,
      athletes(id, first_name, last_name, school),
      facilities(id, name)
    `)
    .eq('id', sessionId)
    .single();

  if (error || !session) notFound();

  const a = session.athletes;
  const athlete = Array.isArray(a) ? a[0] : (a as { id: string; first_name: string; last_name: string; school: string } | null);
  const f = session.facilities;
  const facility = Array.isArray(f) ? f[0] : (f as { id: string; name: string } | null);

  const isParent = session.parent_id === user.id;
  const isAdmin = userData?.role === 'admin';
  const isCoach = session.athlete_id === user.id;

  if (!isParent && !isAdmin && !isCoach) {
    redirect('/dashboard');
  }

  if (!isSessionEditableBeforeStart(session)) {
    redirect(isCoach ? '/coach-sessions' : '/bookings');
  }

  const coachName = athlete
    ? `${athlete.first_name ?? ''} ${athlete.last_name ?? ''}`.trim() || 'Coach'
    : 'Coach';
  const school = athlete?.school ?? '';
  const facilityName = facility?.name ?? '—';

  return (
    <RescheduleClient
      sessionId={sessionId}
      athleteId={session.athlete_id}
      coachName={coachName}
      school={school}
      facilityName={facilityName}
      currentDateTime={session.scheduled_datetime}
    />
  );
}
