import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { ParentAnnouncementsClient } from './parent-announcements-client';

export const dynamic = 'force-dynamic';

export default async function AdminParentAnnouncementsPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/admin/parent-announcements');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') redirect('/');

  const admin = createAdminClient(tenant.slug);
  const { data: coachRows } = await admin
    .from('athletes')
    .select('id, first_name, last_name, school')
    .eq('status', 'active')
    .order('last_name', { ascending: true })
    .limit(800);

  const { data: facilityRows } = await admin
    .from('facilities')
    .select('id, name, school')
    .order('name', { ascending: true })
    .limit(500);

  const coaches = (coachRows ?? []).map((r) => ({
    id: r.id as string,
    first_name: String((r as { first_name?: string }).first_name ?? ''),
    last_name: String((r as { last_name?: string }).last_name ?? ''),
    school: (r as { school?: string | null }).school ?? null,
  }));

  const facilities = (facilityRows ?? []).map((r) => ({
    id: r.id as string,
    name: String((r as { name?: string }).name ?? ''),
    school: (r as { school?: string | null }).school ?? null,
  }));

  return (
    <div className="container mx-auto px-4 py-8">
      <BackLink fallbackHref="/admin" label="Back to admin" className="mb-6 inline-block" />
      <h1 className="text-2xl font-bold mb-2">Parent home announcements</h1>
      <p className="text-muted-foreground mb-8 max-w-2xl">
        Banners on the parent <strong>Home</strong> page. Parents can dismiss per announcement; dismissals are
        tracked by type + reference id.
      </p>
      <ParentAnnouncementsClient coaches={coaches} facilities={facilities} />
    </div>
  );
}
