import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RequestJoinClient } from './request-join-client';
import { User, Calendar, MapPin, Users } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { SchoolLogo } from '@/components/school-logo';

export default async function SessionRequestJoinPage({
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/sessions/${sessionId}/request-join`);

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const roleJoin = userData?.role;
  if (
    roleJoin !== 'parent' &&
    roleJoin !== 'admin' &&
    roleJoin !== 'youth_wrestler'
  ) {
    redirect('/dashboard');
  }

  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select(`
      id,
      parent_id,
      athlete_id,
      join_policy,
      session_mode,
      session_type,
      scheduled_datetime,
      current_participants,
      max_participants,
      total_price,
      athletes(id, first_name, last_name, school, photo_url),
      facilities(id, name, address)
    `)
    .eq('id', sessionId)
    .eq('status', 'scheduled')
    .single();

  if (sessionErr || !session) notFound();

  const s = session as {
    parent_id?: string;
    athlete_id?: string;
    join_policy?: string;
    session_mode?: string;
    session_type?: string;
    scheduled_datetime?: string;
    current_participants?: number;
    max_participants?: number;
    total_price?: number;
    athletes?: { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string } | { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string }[];
    facilities?: { id: string; name?: string; address?: string } | { id: string; name?: string; address?: string }[];
  };

  if (s.parent_id === user.id) redirect('/dashboard');

  if ((s.join_policy ?? 'private') === 'public') {
    redirect(`/sessions/${sessionId}/register`);
  }

  const current = s.current_participants ?? 1;
  const max = s.max_participants ?? 2;
  const isPartnerOpen = s.session_mode === 'partner-open';
  const isSmallGroup = (s.session_type === 'group' || s.session_type === 'small_group') && max > 2;
  const isJoinable = isPartnerOpen || (isSmallGroup && current < max);

  if (!isJoinable || current >= max) notFound();

  const { data: primaryIds } = await supabase
    .from('youth_wrestlers')
    .select('id')
    .eq('parent_id', user.id)
    .eq('active', true);
  const { data: linkedRowsRJ } = await supabase
    .from('youth_wrestler_parents')
    .select('youth_wrestler_id')
    .eq('parent_id', user.id);
  const linkedIdsRJ = [...new Set((linkedRowsRJ ?? []).map((r: { youth_wrestler_id: string }) => r.youth_wrestler_id))];
  const allIdsRJ = [
    ...new Set([...(primaryIds ?? []).map((r: { id: string }) => r.id), ...linkedIdsRJ, user.id]),
  ];

  const { data: youthWrestlersRaw } =
    allIdsRJ.length > 0
      ? await supabase
          .from('youth_wrestlers')
          .select('id, first_name, last_name, age, weight_class, skill_level')
          .in('id', allIdsRJ)
          .eq('active', true)
          .order('created_at', { ascending: false })
      : { data: [] };
  const youthWrestlers = youthWrestlersRaw ?? [];

  const coach = Array.isArray(s.athletes) ? s.athletes[0] : s.athletes;
  const fac = Array.isArray(s.facilities) ? s.facilities[0] : s.facilities;
  const dt = s.scheduled_datetime ? new Date(s.scheduled_datetime) : null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-lg">
      <div className="mb-4">
        <BackLink fallbackHref="/small-group-sessions" label="Back to Small group sessions" />
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Request to join session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              {coach ? `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim() : '—'}
              {coach?.school && (
                <>
                  <SchoolLogo school={coach.school} size="sm" />
                  <span className="text-muted-foreground text-sm">({coach.school})</span>
                </>
              )}
            </p>
            {dt && (
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {formatEST(dt, 'EEEE, MMM d, yyyy')} at {formatEST(dt, 'h:mm a')}
              </p>
            )}
            {fac && (
              <p className="text-sm flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {fac.name}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {current} / {max} participants · Owner will review your request (skill level, weight, etc.)
            </p>
          </div>
          <RequestJoinClient
            sessionId={sessionId}
            youthWrestlers={(youthWrestlers ?? []) as Array<{ id: string; first_name?: string; last_name?: string; age?: number; weight_class?: string; skill_level?: string }>}
          />
        </CardContent>
      </Card>
    </div>
  );
}
