import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { Clock, Mail, PartyPopper } from 'lucide-react';
import {
  CoachMilestoneFooterActions,
  CoachMilestoneScreen,
} from '@/components/coach/coach-milestone-screen';
import {
  COACH_APPLICATION_SUBMITTED_STEPS,
  COACH_WHILE_YOU_WAIT_TIPS,
} from '@/lib/coach-milestone-steps';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ submitted?: string }>;
};

export default async function CoachPendingPage({ searchParams }: Props) {
  const sp = await searchParams;
  const justSubmitted = sp.submitted === '1';

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

  if (userData?.role !== 'coach') {
    redirect('/dashboard');
  }

  const { data: athlete } = await supabase
    .from('athletes')
    .select('status, first_name, rejected_reason, coach_welcome_seen_at')
    .eq('id', user.id)
    .single();

  const coachStatus = athlete?.status || 'active';

  if (coachStatus === 'active') {
    if (!athlete?.coach_welcome_seen_at) {
      redirect('/coach-welcome');
    }
    redirect('/athlete-dashboard');
  }

  if (coachStatus === 'rejected') {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Mail className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="font-serif text-destructive">Verification Not Completed</CardTitle>
            <CardDescription>
              We could not verify your coach account for paid bookings at this time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {athlete?.rejected_reason && (
              <div className="p-4 bg-muted rounded-lg text-left">
                <p className="text-sm font-medium mb-1">Reason:</p>
                <p className="text-sm text-muted-foreground">{athlete.rejected_reason}</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              If you believe this was an error or have questions, please contact us.
            </p>
            <Button asChild variant="outline">
              <a href="mailto:support@thewrestlingguild.com">Contact Support</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const firstName = athlete?.first_name?.trim();
  const title = justSubmitted
    ? firstName
      ? `Nice work, ${firstName}!`
      : 'Coach account created!'
    : firstName
      ? `Hang tight, ${firstName}`
      : 'Verification in progress';

  const description = justSubmitted
    ? 'Your business profile is started. We’ll verify your identity and credentials, usually within 24–48 hours, before enabling paid bookings.'
    : 'We’re verifying your coach account and will email you when paid bookings are enabled.';

  return (
    <CoachMilestoneScreen
      icon={
        justSubmitted ? (
          <PartyPopper className="h-8 w-8 text-[#B89D60]" aria-hidden />
        ) : (
          <Clock className="h-8 w-8 text-[#B89D60]" aria-hidden />
        )
      }
      title={title}
      description={description}
      steps={COACH_APPLICATION_SUBMITTED_STEPS}
      activeStepIndex={justSubmitted ? 1 : 1}
      tips={COACH_WHILE_YOU_WAIT_TIPS}
      tipsTitle="While you wait"
      footer={
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 text-left">
            <p className="text-sm text-muted-foreground">
              We&apos;ll email{' '}
              <span className="font-medium text-foreground">{user.email}</span> when verification is complete.
            </p>
          </div>
          {justSubmitted ? (
            <CoachMilestoneFooterActions
              primary={{ label: 'Finish my profile', href: '/profile' }}
              secondary={{ label: 'See the coach business tools', href: '/coaches' }}
            />
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild size="sm"><Link href="/profile">Finish my profile</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/coaches">How verification works</Link></Button>
            </div>
          )}
        </div>
      }
    />
  );
}
