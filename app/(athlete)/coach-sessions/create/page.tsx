import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { CoachCreateSessionForm } from './coach-create-session-form';
import { getRecommendedPricesForCoach } from '@/lib/coach-session-pricing';
import { getCoachFacilitiesForEdit } from '@/lib/coach-facilities';
import { resolveShareGraphicTheme } from '@/lib/session-share-graphic/themes';
import { coachPublicScheduleUrl } from '@/lib/coach-public-schedule-url';

export const dynamic = 'force-dynamic';

export default async function CoachCreateSessionPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    date?: string;
    time?: string;
  }>;
}) {
  const sp = await searchParams;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'coach' && userData?.role !== 'admin') redirect('/athlete-dashboard');

  const cookieStore = await cookies();
  const viewAsCoachId =
    userData?.role === 'admin' ? cookieStore.get('levelup_view_as_coach_id')?.value : null;
  const coachId = viewAsCoachId || user.id;

  let { data: athlete } = await supabase.from('athletes').select('*').eq('id', coachId).maybeSingle();

  const admin = createAdminClient(tenant.slug);
  if (!athlete && userData?.role === 'admin' && viewAsCoachId) {
    const { data: coachAthlete } = await admin.from('athletes').select('*').eq('id', coachId).maybeSingle();
    athlete = coachAthlete;
  }

  if (!athlete) {
    if (userData?.role === 'admin') {
      redirect(viewAsCoachId ? '/athlete-dashboard' : '/admin');
    }
    redirect('/onboarding');
  }

  const facilities = await getCoachFacilitiesForEdit(admin, coachId);

  const coachName = [athlete.first_name, athlete.last_name].filter(Boolean).join(' ') || 'Coach';

  const recommendedPrices = await getRecommendedPricesForCoach(admin, coachId);
  const defaultShareTheme = resolveShareGraphicTheme(athlete.school);
  const scheduleUrl = coachPublicScheduleUrl(
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      (host.startsWith('localhost') ? `http://${host}` : `https://${host}`),
    coachId
  );

  const typeRaw = sp.type?.trim().toLowerCase();
  const initialType =
    typeRaw === 'small_group' || typeRaw === 'partner' || typeRaw === 'private' ? typeRaw : undefined;
  const dateRaw = sp.date?.trim();
  const initialDate = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : undefined;
  const timeRaw = sp.time?.trim();
  const timeMatch = timeRaw?.match(/^(\d{1,2}):(\d{2})$/);
  const initialTime = (() => {
    if (!timeMatch) return undefined;
    const h = parseInt(timeMatch[1], 10);
    const min = parseInt(timeMatch[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return undefined;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  })();

  return (
    <div className="container mx-auto px-4 py-5 pb-24 md:py-8 max-w-xl">
      <div className="mb-4">
        <BackLink fallbackHref="/coach-sessions" label="Back to Sessions" />
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Create session</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Fill the basics, then copy your link for families.
        </p>
      </div>
      <CoachCreateSessionForm
        coachId={coachId}
        coachName={coachName}
        scheduleUrl={scheduleUrl}
        facilities={facilities.map((f) => ({ ...f, school: f.school ?? '' }))}
        defaultFacilityId={(athlete as { facility_id?: string | null }).facility_id ?? ''}
        recommendedPrices={recommendedPrices}
        defaultShareTheme={defaultShareTheme}
        initialPrefill={{
          type: initialType,
          date: initialDate,
          time: initialTime,
        }}
      />
    </div>
  );
}
