import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { redirectIfMissingUserCellPhone } from '@/lib/require-user-cell-phone';
import { InboxLayoutClient } from './inbox-layout-client';

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  await redirectIfMissingUserCellPhone();

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = userData?.role;
  if (role !== 'parent' && role !== 'coach' && role !== 'youth_wrestler' && role !== 'admin') {
    redirect('/dashboard');
  }

  // Admins see Community like a parent (Spaces, DMs). Envelope goes here; Admin nav link goes to /admin.
  const sidebarRole = role === 'admin' ? 'parent' : (role as 'parent' | 'coach' | 'youth_wrestler');

  return (
    <InboxLayoutClient role={sidebarRole}>
      {children}
    </InboxLayoutClient>
  );
}
