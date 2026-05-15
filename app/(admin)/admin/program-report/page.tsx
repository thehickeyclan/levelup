import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { BackLink } from '@/components/back-link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { formatEST } from '@/lib/format-date';
import {
  aggregateProgramReport,
  programReportCutoff,
  type ProgramReportPeriod,
  type SessionRowForProgram,
} from '@/lib/program-report-aggregates';
import { ProgramReportView } from './program-report-view';

export const dynamic = 'force-dynamic';

function periodLabel(p: ProgramReportPeriod): string {
  switch (p) {
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case '90d':
      return 'Last 90 days';
    case 'ytd':
      return 'Year to date (calendar)';
    default:
      return 'All time';
  }
}

const PERIOD_SET = new Set<ProgramReportPeriod>(['7d', '30d', '90d', 'ytd', 'all']);

export default async function ProgramReportPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string; period?: string }>;
}) {
  const sp = await searchParams;
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
  if (userData?.role !== 'admin') redirect('/');

  const admin = createAdminClient(tenant.slug);

  const { data: athleteRows } = await admin
    .from('athletes')
    .select('id, school, average_rating, review_count')
    .eq('status', 'active')
    .order('school');

  const ratingByCoach = new Map<string, { average_rating: number | null; review_count: number }>();
  const schoolsSet = new Set<string>();
  for (const a of athleteRows ?? []) {
    const row = a as {
      id: string;
      school?: string | null;
      average_rating?: number | null;
      review_count?: number | null;
    };
    ratingByCoach.set(row.id, {
      average_rating: row.average_rating ?? null,
      review_count: row.review_count ?? 0,
    });
    const sch = (row.school ?? '').trim();
    if (sch) schoolsSet.add(sch);
  }

  const sortedSchools = Array.from(schoolsSet).sort((x, y) => x.localeCompare(y));
  const schoolOptions: { value: string; label: string }[] = [
    ...sortedSchools.map((s) => ({ value: s, label: s })),
    { value: '__nonaffiliated__', label: 'Non-affiliated' },
  ];

  let schoolKey = (sp.school ?? '').trim();
  if (!schoolKey) {
    const defaultSchool = sortedSchools[0] ?? '__nonaffiliated__';
    redirect(`/admin/program-report?school=${encodeURIComponent(defaultSchool)}&period=30d`);
  }

  const periodRaw = sp.period ?? '30d';
  const period: ProgramReportPeriod = PERIOD_SET.has(periodRaw as ProgramReportPeriod)
    ? (periodRaw as ProgramReportPeriod)
    : '30d';

  if (!schoolKey) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16 text-center space-y-4">
        <h1 className="text-xl font-semibold">Program report</h1>
        <p className="text-muted-foreground text-sm">
          No coach programs (schools) found yet. Add schools on coach profiles, then return here.
        </p>
        <BackLink
          fallbackHref="/admin"
          label="Back to admin"
          className="text-[#B89D60] font-medium underline"
        />
      </div>
    );
  }

  const validKeys = new Set(schoolOptions.map((o) => o.value));
  if (!validKeys.has(schoolKey)) {
    const fallback = sortedSchools[0] ?? '__nonaffiliated__';
    redirect(`/admin/program-report?school=${encodeURIComponent(fallback)}&period=${period}`);
  }

  const schoolDisplay = schoolKey === '__nonaffiliated__' ? 'Non-affiliated' : schoolKey;

  const nowIso = new Date().toISOString();
  const cutoff = programReportCutoff(period);

  const { data: sessionsRaw, error: sessErr } = await admin
    .from('sessions')
    .select(
      `
      id,
      scheduled_datetime,
      status,
      athlete_id,
      athlete_payment,
      price_per_participant,
      current_participants,
      session_payout_rate,
      session_participants(amount_paid),
      athletes(id, first_name, last_name, school, payout_rate)
    `
    )
    .order('scheduled_datetime', { ascending: false })
    .limit(15000);

  if (sessErr) {
    console.error('program-report sessions:', sessErr.message);
  }

  const sessions = (sessionsRaw ?? []) as SessionRowForProgram[];
  const rows = aggregateProgramReport(sessions, {
    nowIso,
    cutoff,
    schoolFilter: schoolKey,
    ratingByCoach,
  });

  const programTotal = rows.reduce((s, r) => s + r.total_earnings, 0);
  const totalEarningSessions = rows.reduce((s, r) => s + r.earnings_sessions, 0);
  const generatedAtLabel = formatEST(new Date(), 'MMM d, yyyy h:mm a');

  return (
    <ProgramReportView
      tenantLogo={tenant.logo}
      tenantName={tenant.orgName}
      schoolKey={schoolKey}
      schoolDisplay={schoolDisplay}
      period={period}
      periodLabel={periodLabel(period)}
      rows={rows}
      programTotal={programTotal}
      totalEarningSessions={totalEarningSessions}
      generatedAtLabel={generatedAtLabel}
      schoolOptions={schoolOptions}
    />
  );
}
