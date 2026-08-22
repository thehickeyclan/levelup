import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Edit, Calendar, User, School, Target, Heart, Award, Smartphone, DollarSign } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { CoachSessionBadge } from '@/components/coach-session-badge';
import { ProfileImage } from '@/components/profile-image';
import { formatEST } from '@/lib/format-date';
import {
  buildWrestlerSpendLines,
  computeWrestlerSpendSummary,
  formatWrestlerUsd,
  wrestlerAmountPaidFromSession,
} from '@/lib/wrestler-spend-stats';
import { LinkedParentsCard } from './linked-parents-card';

export default async function YouthWrestlerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  
  if (!tenant) {
    redirect('/404');
  }

  const tenantSlug = tenant.slug;
  const supabase = await createClient(tenantSlug);
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }

  // Check user role
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role === 'coach') {
    redirect('/athlete-dashboard');
  }

  const isAdmin = userData?.role === 'admin';
  // parent and admin can both access (admin redirected to dashboard if no matching wrestler)

  // Get youth wrestler (RLS: primary or linked parent can see)
  const { data: youthWrestler, error } = await supabase
    .from('youth_wrestlers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !youthWrestler) {
    redirect('/dashboard');
  }

  const isPrimary = youthWrestler.parent_id === user.id;
  // Fetch linked parents for "Linked parents" section (primary can add; both can see list)
  let parents: { parentId: string; email: string; isPrimary: boolean }[] = [];
  const { data: links } = await supabase.from('youth_wrestler_parents').select('parent_id').eq('youth_wrestler_id', id);
  const linkedIds = (links ?? []).map((r) => r.parent_id);
  // Older/admin-created data can contain the primary parent in the additional
  // links table. Show each account once and keep the primary designation.
  const allParentIds = [...new Set([youthWrestler.parent_id, ...linkedIds].filter(Boolean))];
  if (allParentIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, email').in('id', allParentIds);
    const byId = new Map((users ?? []).map((u) => [u.id, u]));
    parents = allParentIds.map((pid) => ({
      parentId: pid,
      email: byId.get(pid)?.email ?? '',
      isPrimary: pid === youthWrestler.parent_id,
    }));
  }

  // Completed session count (via session_participants for accuracy)
  const { data: participantRows } = await supabase
    .from('session_participants')
    .select('session_id, sessions(status)')
    .eq('youth_wrestler_id', id);
  const completedCount = (participantRows ?? []).filter((p: { sessions?: { status: string }[] | null }) => p.sessions?.[0]?.status === 'completed').length;

  // Get sessions for this youth wrestler (sessions where they participated)
  const sessionIds = [...new Set((participantRows ?? []).map((p: { session_id: string }) => p.session_id))];
  const { data: sessions } = sessionIds.length > 0
    ? await supabase
        .from('sessions')
        .select('*, athletes(first_name, last_name, photo_url), facilities(name), session_participants(youth_wrestler_id, amount_paid, paid)')
        .in('id', sessionIds)
        .order('scheduled_datetime', { ascending: false })
    : { data: [] };

  const amountPaidForWrestler = (session: any) => wrestlerAmountPaidFromSession(session, id);

  const displayPrice = (session: any) => {
    const paid = amountPaidForWrestler(session);
    if (paid != null) return paid;
    const total = Number(session.total_price);
    if (total > 0) return total;
    const per = session.price_per_participant != null ? Number(session.price_per_participant) : 0;
    return per;
  };

  const spendLines = buildWrestlerSpendLines(sessions ?? [], id);
  const spendSummary = computeWrestlerSpendSummary(spendLines);

  const upcomingSessions = sessions?.filter(
    (s: any) => s.status === 'scheduled' && new Date(s.scheduled_datetime) >= new Date()
  ) || [];

  const pastSessions = sessions?.filter(
    (s: any) => s.status === 'completed' || new Date(s.scheduled_datetime) < new Date()
  ) || [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <BackLink
          fallbackHref={isAdmin ? '/admin?section=people&sub=athletes' : '/dashboard'}
          label={isAdmin ? 'Back to Admin' : 'Back to Dashboard'}
        />
      </div>

      {/* Profile Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            <ProfileImage
              src={youthWrestler.photo_url}
              alt={`${youthWrestler.first_name} ${youthWrestler.last_name}`}
              focusX={youthWrestler.photo_focus_x}
              focusY={youthWrestler.photo_focus_y}
              className="w-32 h-32 border-4 border-accent/30"
              fallbackIconClassName="h-16 w-16 text-muted-foreground"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold">
                    {youthWrestler.first_name} {youthWrestler.last_name}
                  </h1>
                  <CoachSessionBadge totalSessions={completedCount} size="md" />
                </div>
                {(isPrimary || isAdmin) && (
                  <Link href={`/wrestlers/${id}/edit`}>
                    <Button variant="outline" size="icon">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                {youthWrestler.age && <span>{youthWrestler.age} years old</span>}
                {youthWrestler.skill_level && (
                  <span className="capitalize">{youthWrestler.skill_level}</span>
                )}
                {youthWrestler.weight_class && <span>{youthWrestler.weight_class}</span>}
              </div>
              {!isAdmin && (
                <Link href={`/browse?youthWrestlerId=${id}`}>
                  <Button variant="premium">
                    <Calendar className="h-4 w-4 mr-2" />
                    Find an Elite Coach for {youthWrestler.first_name}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked parents: add another parent by email so they see this wrestler too */}
      <div className="mb-6">
        <LinkedParentsCard youthWrestlerId={id} isPrimary={isPrimary} parents={parents} />
      </div>

      {(sessions?.length ?? 0) > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Activity &amp; spending
            </CardTitle>
            <CardDescription>
              {upcomingSessions.length} upcoming · {completedCount} completed ·{' '}
              {spendSummary.paidSessionCount} paid session
              {spendSummary.paidSessionCount !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total spent</p>
                <p className="text-2xl font-semibold tabular-nums text-accent">
                  ${formatWrestlerUsd(spendSummary.totalSpent)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg / month</p>
                <p className="text-2xl font-semibold tabular-nums">
                  ${formatWrestlerUsd(spendSummary.avgMonthlySpent)}
                </p>
                {spendSummary.monthsActive > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Since first paid session ({spendSummary.monthsActive.toFixed(1)} mo)
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Upcoming</p>
                <p className="text-2xl font-semibold tabular-nums">{upcomingSessions.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Completed</p>
                <p className="text-2xl font-semibold tabular-nums">{completedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Athlete cell
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(youthWrestler as { phone?: string | null }).phone ? (
              <p className="font-medium">{(youthWrestler as { phone?: string | null }).phone}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not on file —{' '}
                <Link href={`/wrestlers/${id}/edit`} className="text-accent underline">
                  add a number
                </Link>{' '}
                before booking sessions.
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Used so coaches can text session updates to this athlete.
            </p>
          </CardContent>
        </Card>

        {/* School Info */}
        {(youthWrestler.school || youthWrestler.graduation_year) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <School className="h-5 w-5" />
                School Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              {youthWrestler.school && (
                <p className="font-medium mb-1">{youthWrestler.school}</p>
              )}
              {youthWrestler.graduation_year && (
                <p className="text-sm text-muted-foreground">Class of {youthWrestler.graduation_year}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Wrestling Experience */}
        {youthWrestler.wrestling_experience && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Experience
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{youthWrestler.wrestling_experience}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Goals */}
      {youthWrestler.goals && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Goals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{youthWrestler.goals}</p>
          </CardContent>
        </Card>
      )}

      {/* Medical Notes */}
      {youthWrestler.medical_notes && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Medical Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{youthWrestler.medical_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Sessions */}
      {upcomingSessions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Upcoming Sessions</CardTitle>
            <CardDescription>
              {upcomingSessions.length} scheduled session{upcomingSessions.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingSessions.map((session: any) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      {formatEST(new Date(session.scheduled_datetime), 'EEEE, MMMM d, yyyy')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatEST(new Date(session.scheduled_datetime), 'h:mm a')}
                      {' • '}
                      {session.athletes?.first_name} {session.athletes?.last_name}
                      {' • '}
                      {session.facilities?.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${displayPrice(session).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{session.session_type}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session History */}
      {pastSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Session History</CardTitle>
            <CardDescription>
              {pastSessions.length} past session{pastSessions.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pastSessions.map((session: any) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      {formatEST(new Date(session.scheduled_datetime), 'MMMM d, yyyy')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {session.athletes?.first_name} {session.athletes?.last_name}
                      {' • '}
                      {session.facilities?.name}
                      {' • '}
                      <span className="capitalize">{session.status}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${displayPrice(session).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{session.session_type}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {sessions?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No sessions yet</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              Book a session to get started with private lessons.
            </p>
            <Link href={`/browse?youthWrestlerId=${id}`}>
              <Button>
                <Calendar className="h-4 w-4 mr-2" />
                Book First Session
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
