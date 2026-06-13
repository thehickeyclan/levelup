import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function CoachPendingPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  
  // Only coaches should see this page
  if (userData?.role !== 'coach') {
    redirect('/dashboard');
  }

  // Check athlete status
  const { data: athlete } = await supabase
    .from('athletes')
    .select('status, first_name, rejected_reason')
    .eq('id', user.id)
    .single();

  // Treat undefined/null status as 'active' for backwards compatibility
  const coachStatus = athlete?.status || 'active';
  
  // If approved (or no status column yet), redirect to dashboard
  if (coachStatus === 'active') {
    redirect('/athlete-dashboard');
  }

  // If rejected, show rejection message
  if (coachStatus === 'rejected') {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Mail className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="font-serif text-destructive">Application Not Approved</CardTitle>
            <CardDescription>
              Unfortunately, your coach application was not approved at this time.
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

  // Pending status - show waiting message
  return (
    <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-8 w-8 text-accent" />
          </div>
          <CardTitle className="font-serif">Application Under Review</CardTitle>
          <CardDescription>
            Thanks for applying{athlete?.first_name ? `, ${athlete.first_name}` : ''}! We&apos;re reviewing your application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-left">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Application Submitted</p>
                <p className="text-xs text-muted-foreground">Your information is complete</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-left">
              <Clock className="h-5 w-5 text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Under Review</p>
                <p className="text-xs text-muted-foreground">We typically respond within 24-48 hours</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-left opacity-50">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Get Approved</p>
                <p className="text-xs text-muted-foreground">Start coaching and earning</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              We&apos;ll email you at <span className="font-medium text-foreground">{user.email}</span> once your application is reviewed.
            </p>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-2">While you wait:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>- Gather SafeSport and background-check documentation if you still need them</li>
              <li>- Think about your coaching schedule and availability</li>
              <li>- Prepare a great profile photo</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
