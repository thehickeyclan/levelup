import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { getRequestBaseUrlFromHeaders } from '@/lib/request-base-url';
import { coachPublicScheduleUrl } from '@/lib/coach-public-schedule-url';
import { CoachWelcomeClient } from '@/components/coach/coach-welcome-client';

export const dynamic = 'force-dynamic';

export default async function CoachWelcomePage() {
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
  if (userData?.role !== 'coach') redirect('/dashboard');

  const { data: athlete } = await supabase
    .from('athletes')
    .select('status, first_name, coach_welcome_seen_at')
    .eq('id', user.id)
    .single();

  const status = athlete?.status || 'active';
  if (status === 'pending') redirect('/coach-pending');
  if (status === 'rejected') redirect('/coach-pending');
  if (athlete?.coach_welcome_seen_at) redirect('/athlete-dashboard');

  const baseUrl = getRequestBaseUrlFromHeaders(headersList);
  const bookingUrl = coachPublicScheduleUrl(baseUrl, user.id);

  return (
    <CoachWelcomeClient coachId={user.id} firstName={athlete?.first_name ?? null} bookingUrl={bookingUrl} />
  );
}
