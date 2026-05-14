import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatEST } from '@/lib/format-date';
import { CheckCircle, Calendar, MapPin, Copy, Share2 } from 'lucide-react';
import { SchoolLogo } from '@/components/school-logo';
import { ProfileImage } from '@/components/profile-image';
import { BookingConfirmedClient } from '../booking-confirmed-client';

export default async function BookingConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<{ sessionId?: string; code?: string; mode?: string }>;
}) {
  const { athleteId } = await params;
  const sp = await searchParams;
  const sessionId = sp?.sessionId;

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) notFound();

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/book/' + athleteId + '/confirmed');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (
    userData?.role !== 'parent' &&
    userData?.role !== 'admin' &&
    userData?.role !== 'youth_wrestler'
  ) {
    redirect('/dashboard');
  }

  if (!sessionId) {
    redirect('/dashboard');
  }

  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('*, athletes(id, first_name, last_name, school, photo_url), facilities(id, name, address)')
    .eq('id', sessionId)
    .eq('parent_id', user.id)
    .single();

  if (sessionErr || !session) notFound();

  const { data: participants } = await supabase
    .from('session_participants')
    .select('*, youth_wrestlers(id, first_name, last_name, age, weight_class, skill_level)')
    .eq('session_id', sessionId)
    .eq('parent_id', user.id);

  const athlete = session.athletes as { id: string; first_name: string; last_name: string; school: string; photo_url?: string } | null;
  const facility = session.facilities as { id: string; name: string; address?: string } | null;
  const sessionMode = (session as { session_mode?: string }).session_mode ?? 'private';
  const partnerCode = (session as { partner_invite_code?: string }).partner_invite_code ?? sp?.code ?? null;
  const baseUrl = host.startsWith('localhost') ? `http://${host}` : `https://${host}`;
  const joinUrl = partnerCode ? `${baseUrl}/join/${partnerCode}` : null;

  const scheduledAt = session.scheduled_datetime ? new Date(session.scheduled_datetime) : null;
  const dateTime = scheduledAt
    ? `${formatEST(scheduledAt, 'EEEE, MMMM d, yyyy')} at ${formatEST(scheduledAt, 'h:mm a')}`
    : '';

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-green-600 mb-4">
            <CheckCircle className="h-10 w-10" />
            <h1 className="text-2xl font-bold text-foreground">
              {sessionMode === 'private' || sessionMode === 'sibling'
                ? 'Session Booked!'
                : 'Session Reserved!'}
            </h1>
          </div>

          {(sessionMode === 'private' || sessionMode === 'sibling') && (
            <>
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  <ProfileImage
                    src={athlete?.photo_url}
                    alt={athlete ? `${athlete.first_name} ${athlete.last_name}` : 'Coach'}
                    focusX={(athlete as { photo_focus_x?: number })?.photo_focus_x}
                    focusY={(athlete as { photo_focus_y?: number })?.photo_focus_y}
                    className="w-14 h-14 shrink-0"
                    fallbackIconClassName="h-7 w-7 text-muted-foreground"
                  />
                  <div>
                    <p className="font-semibold">{athlete?.first_name} {athlete?.last_name}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      {athlete?.school && (
                        <>
                          <SchoolLogo school={athlete.school} size="sm" />
                          {athlete.school}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <p className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4" />
                  {dateTime}
                </p>
                {facility && (
                  <p className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4" />
                    {facility.name}
                    {facility.address && ` — ${facility.address}`}
                  </p>
                )}
                <p className="text-lg font-semibold">${Number(session.total_price).toFixed(2)}</p>
              </div>
              <div className="flex gap-3 mb-6">
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/bookings">View My bookings</Link>
                </Button>
                <Button asChild className="flex-1">
                  <a href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=Wrestling+Session&dates=${scheduledAt?.toISOString().replace(/[-:]/g, '').slice(0, 15)}/${scheduledAt?.toISOString().replace(/[-:]/g, '').slice(0, 15)}`} target="_blank" rel="noopener noreferrer">
                    Add to Calendar
                  </a>
                </Button>
              </div>
              <div className="space-y-3 border-t pt-4">
                <Button asChild className="w-full">
                  <Link href={`/book/${athleteId}`}>Book another with this coach</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/training">Book another session</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/bookings">Done — Back to My bookings</Link>
                </Button>
              </div>
            </>
          )}

          {sessionMode === 'partner-invite' && joinUrl && (
            <>
              <BookingConfirmedClient
                joinUrl={joinUrl}
                dateTime={dateTime}
                facilityName={facility?.name}
                athleteName={`${athlete?.first_name ?? ''} ${athlete?.last_name ?? ''}`.trim()}
                scheduledAt={scheduledAt?.toISOString() ?? ''}
              />
              <div className="space-y-3 border-t pt-4 mt-4">
                <Button asChild className="w-full">
                  <Link href={`/book/${athleteId}`}>Book another with this coach</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/training">Book another session</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/bookings">Done — Back to My bookings</Link>
                </Button>
              </div>
            </>
          )}

          {sessionMode === 'partner-open' && (
            <>
              <p className="text-muted-foreground mb-4">
                Your session is open for others to join. You&apos;ll receive notifications when someone requests to join.
              </p>
              <Button asChild className="mb-4">
                <Link href="/partner-sessions">View Open Partner Sessions</Link>
              </Button>
              <div className="space-y-3 border-t pt-4">
                <Button asChild className="w-full">
                  <Link href={`/book/${athleteId}`}>Book another with this coach</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/training">Book another session</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/bookings">Done — Back to My bookings</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
