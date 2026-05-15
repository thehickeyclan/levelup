import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { CreateSessionForm } from './create-session-form';

export const dynamic = 'force-dynamic';

export default async function AdminCreateSessionPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') redirect('/');

  const admin = createAdminClient(tenant.slug);
  const [athletesRes, facilitiesRes] = await Promise.all([
    admin.from('athletes').select('id, first_name, last_name, school').eq('status', 'active').order('last_name'),
    admin.from('facilities').select('id, name, school, address').order('name'),
  ]);

  if (athletesRes.error) {
    console.error('[admin/sessions/create] athletes query failed', athletesRes.error);
  }
  if (facilitiesRes.error) {
    console.error('[admin/sessions/create] facilities query failed', facilitiesRes.error);
  }

  const athletes = (athletesRes.data ?? []).map((a) => ({
    id: a.id,
    name: [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || 'Coach',
    school: a.school ?? '',
  }));
  const facilities = facilitiesRes.data ?? [];
  const loadError =
    athletesRes.error?.message ||
    facilitiesRes.error?.message ||
    null;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <BackLink fallbackHref="/admin" label="Back to Admin" />
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-serif text-foreground">Create small group session</h1>
        <p className="text-muted-foreground mt-1">
          Assign a coach, set time and facility, then share the link so kids can join.
        </p>
      </div>
      {loadError && (
        <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Could not load coaches or facilities: {loadError}
        </p>
      )}
      <CreateSessionForm athletes={athletes} facilities={facilities} />
    </div>
  );
}
