import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Calendar, User, MapPin, Users } from 'lucide-react';
import { SchoolLogo } from '@/components/school-logo';
import { formatEST } from '@/lib/format-date';

export default async function YouthDashboardPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/youth-dashboard');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'youth_wrestler') {
    if (userData?.role === 'parent') redirect('/dashboard');
    if (userData?.role === 'coach') redirect('/athlete-dashboard');
    if (userData?.role === 'admin') redirect('/admin');
    redirect('/');
  }

  const youthWrestlerId = user.id;
  const admin = createAdminClient(tenant.slug);

  const { data: profile } = await admin.from('youth_wrestlers').select('id, first_name, last_name').eq('id', youthWrestlerId).single();

  const { data: participantRows } = await admin
    .from('session_participants')
    .select('session_id')
    .eq('youth_wrestler_id', youthWrestlerId);
  const sessionIds = [...new Set((participantRows ?? []).map((r: { session_id: string }) => r.session_id))];

  const nowISO = new Date().toISOString();
  const { data: upcomingSessions } = sessionIds.length > 0
    ? await admin
        .from('sessions')
        .select(`
          id,
          scheduled_datetime,
          status,
          total_price,
          session_type,
          session_mode,
          athletes(id, first_name, last_name, school),
          facilities(id, name, address),
          session_participants(youth_wrestler_id, youth_wrestlers(id, first_name, last_name))
        `)
        .in('id', sessionIds)
        .eq('status', 'scheduled')
        .gte('scheduled_datetime', nowISO)
        .order('scheduled_datetime', { ascending: true })
        .limit(15)
    : { data: [] };

  const { data: pastSessions } = sessionIds.length > 0
    ? await admin
        .from('sessions')
        .select(`
          id,
          scheduled_datetime,
          status,
          total_price,
          session_type,
          athletes(id, first_name, last_name, school),
          facilities(id, name)
        `)
        .in('id', sessionIds)
        .or('status.eq.completed,status.eq.cancelled,status.eq.no-show,scheduled_datetime.lt.' + nowISO)
        .order('scheduled_datetime', { ascending: false })
        .limit(10)
    : { data: [] };

  const { data: workspaces } = await admin
    .from('workspaces')
    .select('id, athletes(id, first_name, last_name, school)')
    .eq('youth_wrestler_id', youthWrestlerId)
    .order('updated_at', { ascending: false })
    .limit(5);

  const coachIds = new Set<string>();
  for (const s of [...(upcomingSessions ?? []), ...(pastSessions ?? [])]) {
    const a = (s as { athletes?: { id: string } | { id: string }[] }).athletes;
    const o = Array.isArray(a) ? a[0] : a;
    if (o?.id) coachIds.add(o.id);
  }
  const coachesList = coachIds.size > 0
    ? await admin.from('athletes').select('id, first_name, last_name, school').in('id', [...coachIds])
    : { data: [] };

  const firstName = (profile as { first_name?: string } | null)?.first_name ?? '';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Athlete Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back{firstName ? `, ${firstName}` : ''}. Your sessions, coaches, and workspaces.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/browse">Book a coach</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/small-group-sessions">Group sessions</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                My sessions
              </CardTitle>
              <CardDescription>Upcoming and recent sessions you’re in</CardDescription>
            </CardHeader>
            <CardContent>
              {(!upcomingSessions || upcomingSessions.length === 0) && (!pastSessions || pastSessions.length === 0) ? (
                <div className="py-4 space-y-4">
                  <p className="text-muted-foreground">No sessions yet. Browse coaches and book your first session.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href="/browse">Browse coaches</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/small-group-sessions">Join group sessions</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <ul className="space-y-3">
                  {(upcomingSessions ?? []).slice(0, 5).map((s: Record<string, unknown>) => {
                    const a = s.athletes as { first_name?: string; last_name?: string; school?: string } | { first_name?: string; last_name?: string; school?: string }[] | undefined;
                    const coach = Array.isArray(a) ? a[0] : a;
                    const f = s.facilities as { name?: string } | { name?: string }[] | undefined;
                    const fac = Array.isArray(f) ? f[0] : f;
                    const dt = new Date((s.scheduled_datetime as string));
                    return (
                      <li key={s.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                        <div>
                          <p className="font-medium">{formatEST(dt, 'EEE, MMM d')} at {formatEST(dt, 'h:mm a')}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {coach ? `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim() : '—'}
                            {coach?.school && <SchoolLogo school={coach.school} size="sm" />}
                          </p>
                          {fac && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {(fac as { name?: string }).name}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {(pastSessions ?? []).slice(0, 2).map((s: Record<string, unknown>) => {
                    const a = s.athletes as { first_name?: string; last_name?: string } | undefined;
                    const coach = Array.isArray(a) ? a[0] : a;
                    const f = s.facilities as { name?: string } | undefined;
                    const fac = Array.isArray(f) ? f[0] : f;
                    const dt = new Date((s.scheduled_datetime as string));
                    return (
                      <li key={s.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0 opacity-80">
                        <div>
                          <p className="text-sm">{formatEST(dt, 'EEE, MMM d')} · {coach ? `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim() : '—'}</p>
                          {fac && <p className="text-xs text-muted-foreground">{(fac as { name?: string }).name}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* My coaches */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                My coaches
              </CardTitle>
              <CardDescription>Coaches you’ve trained with</CardDescription>
            </CardHeader>
            <CardContent>
              {(coachesList.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No coaches yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(coachesList.data ?? []).map((c: { id: string; first_name?: string; last_name?: string; school?: string }) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                      {c.school && <SchoolLogo school={c.school} size="sm" />}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Quick access */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/small-group-sessions" className="block">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Users className="h-4 w-4" />
                  Group & partner sessions
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
