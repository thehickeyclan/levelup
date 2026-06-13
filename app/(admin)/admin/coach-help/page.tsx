import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CoachHelpResourcesAdmin, type CoachHelpResourceRow } from '@/components/coach-help-resources-admin';
import { ExternalLink } from 'lucide-react';

export const metadata = {
  title: 'Coach help (admin) | The Guild',
  description: 'Manage extra how-to videos and see coach help engagement.',
};

export default async function AdminCoachHelpPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/admin/coach-help');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') redirect('/');

  const admin = createAdminClient(tenant.slug);
  const { data: rows, error } = await admin
    .from('coach_help_resources')
    .select('id, title, url, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('coach_help_resources (admin page):', error.message);
  }

  const initialResources = (rows ?? []) as CoachHelpResourceRow[];

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <BackLink fallbackHref="/admin" label="Back to Admin" />
      </div>

      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold text-foreground font-serif md:text-3xl">Coach help</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Curate extra Loom or YouTube links for the coach-facing help page, and review opens and votes. Answer coach
          questions on the live page (Q&amp;A lives with the featured video).
        </p>
      </div>

      <Card className="mb-6 border-accent/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coach-facing page</CardTitle>
          <CardDescription>
            Coaches use this URL for tutorials and guides (same host as the rest of the app).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <code className="text-sm bg-muted px-3 py-2 rounded-md border break-all flex-1">/coach-help</code>
          <Button asChild variant="outline" className="min-h-[44px] shrink-0">
            <Link href="/coach-help" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
              Open in new tab
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Featured home-screen video</CardTitle>
          <CardDescription>
            The hero tutorial is set with <code className="text-xs bg-muted px-1 rounded">NEXT_PUBLIC_COACH_HELP_HOME_SCREEN_VIDEO_URL</code> (optional env override). Coaches still see it on{' '}
            <Link href="/coach-help" className="text-accent underline">
              /coach-help
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>

      <CoachHelpResourcesAdmin initialResources={initialResources} />
    </div>
  );
}
