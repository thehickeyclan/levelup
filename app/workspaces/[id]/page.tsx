import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { WorkspaceClient } from './workspace-client';

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient(tenant.slug);
  const { data: workspace } = await admin.from('workspaces').select('parent_id, youth_wrestler_id, athlete_id').eq('id', id).single();
  if (!workspace) notFound();

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = userData?.role;
  const workspaceDeniedRedirect =
    role === 'coach'
      ? '/athlete-dashboard'
      : role === 'youth_wrestler'
        ? '/training'
        : role === 'admin'
          ? '/admin'
          : '/dashboard';
  const hasAccess =
    workspace.parent_id === user.id ||
    workspace.athlete_id === user.id ||
    workspace.youth_wrestler_id === user.id ||
    role === 'admin';
  if (!hasAccess) redirect(workspaceDeniedRedirect);

  const isCoach = workspace.athlete_id === user.id;
  const workspaceHomeHref = workspaceDeniedRedirect;
  return <WorkspaceClient workspaceId={id} isCoach={isCoach} workspaceHomeHref={workspaceHomeHref} />;
}
