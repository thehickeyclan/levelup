import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { Users, Plus } from 'lucide-react';
import { startOfWeek, endOfWeek, addWeeks } from 'date-fns';
import { SmallGroupSessionsClient } from './small-group-sessions-client';

export default async function SmallGroupSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string }>;
}) {
  const sp = await searchParams;
  const requested = sp?.requested === '1';

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/small-group-sessions');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role === 'coach') redirect('/athlete-dashboard');
  if (userData?.role !== 'parent' && userData?.role !== 'admin' && userData?.role !== 'youth_wrestler') redirect('/dashboard');

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const nextWeekEnd = endOfWeek(addWeeks(now, 1), { weekStartsOn: 0 });

  // Small group: this week and next week
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      id,
      scheduled_datetime,
      session_type,
      session_mode,
      join_policy,
      focus_area,
      current_participants,
      max_participants,
      total_price,
      price_per_participant,
      parent_id,
      athlete_id,
      athletes(id, first_name, last_name, school, photo_url),
      facilities(id, name, address),
      session_participants(youth_wrestlers(id, first_name, last_name, photo_url))
    `)
    .in('session_type', ['group', 'small_group'])
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', weekStart.toISOString())
    .lte('scheduled_datetime', nextWeekEnd.toISOString())
    .order('scheduled_datetime', { ascending: true });

  // Open partner sessions: someone looking for a partner (any date)
  const { data: partnerSessions } = await supabase
    .from('sessions')
    .select(`
      id,
      scheduled_datetime,
      session_type,
      session_mode,
      join_policy,
      focus_area,
      current_participants,
      max_participants,
      total_price,
      price_per_participant,
      parent_id,
      athlete_id,
      athletes(id, first_name, last_name, school, photo_url),
      facilities(id, name, address),
      session_participants(youth_wrestlers(id, first_name, last_name, photo_url, age, weight_class, skill_level))
    `)
    .eq('session_mode', 'partner-open')
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', now.toISOString())
    .order('scheduled_datetime', { ascending: true });

  const partnerList = (partnerSessions ?? []).filter(
    (s: { current_participants?: number; max_participants?: number }) =>
      (s.current_participants ?? 1) < (s.max_participants ?? 2)
  );

  const list = sessions ?? [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="mb-4">
          <BackLink fallbackHref="/dashboard" label="Back to Dashboard" />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8" />
              Small group & partner sessions
            </h1>
            <p className="text-muted-foreground mt-1">
              Pick a session. Click Register. Choose your kid. Pay. Done.
            </p>
          </div>
          {userData?.role === 'admin' && (
            <Button asChild>
              <Link href="/admin/sessions/create" className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create small group session
              </Link>
            </Button>
          )}
        </div>
      </div>

      <SmallGroupSessionsClient
        sessions={list}
        partnerSessions={partnerList}
        userId={user.id}
        isAdmin={userData?.role === 'admin'}
        bookingAsAthlete={userData?.role === 'youth_wrestler'}
        selfWrestlerId={userData?.role === 'youth_wrestler' ? user.id : undefined}
      />
    </div>
  );
}
