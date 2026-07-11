import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { redirectIfMissingUserCellPhone } from '@/lib/require-user-cell-phone';

export default async function ActivityLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  await redirectIfMissingUserCellPhone();

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = userData?.role;
  if (!role || !['parent', 'coach', 'youth_wrestler', 'admin'].includes(role)) {
    redirect('/dashboard');
  }

  return <div className="min-h-screen pb-24">{children}</div>;
}
