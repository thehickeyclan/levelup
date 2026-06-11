import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getEffectiveFilledCount } from '@/lib/sessions';
import { sessionPricePerParticipantUsd } from '@/lib/session-price';
import { PackageBundleClient } from './package-bundle-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseInviteCodes(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  const codes: string[] = [];
  for (const part of parts) {
    for (const piece of part.split(',')) {
      const c = piece.trim().toUpperCase();
      if (c) codes.push(c);
    }
  }
  return [...new Set(codes)];
}

export default async function JoinPackagePage({
  searchParams,
}: {
  searchParams: Promise<{ codes?: string | string[] }>;
}) {
  const sp = await searchParams;
  const codes = parseInviteCodes(sp.codes);

  if (codes.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Session package</CardTitle>
            <CardDescription>
              Add session invite codes to the URL, e.g.{' '}
              <code className="text-xs">/join/package?codes=ABC123,DEF456</code>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) notFound();

  const packagePath = `/join/package?codes=${encodeURIComponent(codes.join(','))}`;

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(packagePath)}`);
  }

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role === 'coach') {
    redirect('/athlete-dashboard');
  }

  const admin = createAdminClient(tenant.slug);
  const { data: rows, error } = await admin
    .from('sessions')
    .select(
      `
      id,
      status,
      scheduled_datetime,
      session_type,
      price_per_participant,
      partner_invite_code,
      max_participants,
      current_participants,
      athlete_id,
      athletes(first_name, last_name),
      facilities(name)
    `
    )
    .in('partner_invite_code', codes);

  if (error) notFound();

  const byCode = new Map(
    (rows ?? []).map((r) => [
      String((r as { partner_invite_code?: string }).partner_invite_code ?? '').toUpperCase(),
      r,
    ])
  );

  const missing = codes.filter((c) => !byCode.has(c));
  const problems: string[] = [];

  if (missing.length > 0) {
    problems.push(`Invalid or expired invite code${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }

  const packageSessions: Array<{
    sessionId: string;
    inviteCode: string;
    scheduled_datetime: string;
    session_type: string | null;
    price_per_participant: number;
    coach_name: string;
    coach_id: string;
    facility_name: string;
  }> = [];

  for (const code of codes) {
    const row = byCode.get(code);
    if (!row) continue;

    const status = String((row as { status?: string }).status ?? '');
    if (status !== 'scheduled') {
      problems.push(`Session ${code} is no longer open for registration`);
      continue;
    }

    const max = (row as { max_participants?: number }).max_participants ?? 1;
    const filled = getEffectiveFilledCount({
      current_participants: (row as { current_participants?: number }).current_participants,
      max_participants: max,
      session_participants: null,
    });
    if (filled >= max) {
      problems.push(`Session ${code} is full`);
      continue;
    }

    const athleteRow = (row as { athletes?: unknown }).athletes;
    const coach = Array.isArray(athleteRow) ? athleteRow[0] : athleteRow;
    const coachOne = coach as { first_name?: string; last_name?: string } | null;
    const coachName = coachOne
      ? [coachOne.first_name, coachOne.last_name].filter(Boolean).join(' ').trim() || 'Coach'
      : 'Coach';

    const facRow = (row as { facilities?: unknown }).facilities;
    const fac = Array.isArray(facRow) ? facRow[0] : facRow;
    const facilityName = (fac as { name?: string } | null)?.name?.trim() ?? '';

    packageSessions.push({
      sessionId: (row as { id: string }).id,
      inviteCode: code,
      scheduled_datetime: (row as { scheduled_datetime: string }).scheduled_datetime,
      session_type: (row as { session_type?: string | null }).session_type ?? null,
      price_per_participant: sessionPricePerParticipantUsd(
        (row as { price_per_participant?: number }).price_per_participant
      ),
      coach_name: coachName,
      coach_id: (row as { athlete_id: string }).athlete_id,
      facility_name: facilityName,
    });
  }

  if (packageSessions.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Could not load package</CardTitle>
            <CardDescription>
              {problems.length > 0 ? problems.join(' · ') : 'No sessions found for those codes.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/training?tab=sessions">Browse training</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg pb-8">
      <Card>
        <CardHeader>
          <CardTitle>Choose your sessions</CardTitle>
          <CardDescription>
            Select the sessions you want — all 4, just 2, or any combination — then checkout once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {problems.length > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 rounded-md border border-amber-700/40 bg-amber-900/20 px-3 py-2">
              {problems.join(' · ')}
            </p>
          )}
          <PackageBundleClient sessions={packageSessions} />
        </CardContent>
      </Card>
    </div>
  );
}
