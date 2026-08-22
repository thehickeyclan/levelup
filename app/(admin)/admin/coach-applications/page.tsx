import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { CoachApplicationsClient } from './coach-applications-client';

export const dynamic = 'force-dynamic';

export default async function CoachApplicationsPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') redirect('/dashboard');

  // Use admin client to fetch all coach applications
  const admin = createAdminClient(tenant.slug);
  
  const { data: rawApplications } = await admin
    .from('athletes')
    .select(`
      id,
      first_name,
      last_name,
      school,
      coach_type,
      bio,
      weight_class,
      status,
      active,
      safesport_certified,
      safesport_expiration,
      usa_wrestling_certified,
      usa_wrestling_expiration,
      background_check,
      background_check_expiration,
      payout_method,
      venmo_handle,
      zelle_email,
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_relationship,
      tshirt_size,
      date_of_birth,
      agreement_signed_at,
      admin_notes,
      rejected_reason,
      created_at,
      users!inner(email, phone)
    `)
    .order('created_at', { ascending: false });

  // Map Postgres column names to UI fields (coach signup writes zelle_email, *_expiration).
  const applications = (rawApplications || []).map((app) => {
    const row = app as Record<string, unknown>;
    const users = Array.isArray(app.users) ? app.users[0] : app.users;
    return {
      ...app,
      safesport_expiry: (row.safesport_expiration ?? row.safesport_expiry ?? null) as string | null,
      usa_wrestling_expiry: (row.usa_wrestling_expiration ?? null) as string | null,
      background_check_date: (row.background_check_expiration ?? row.background_check_date ?? null) as string | null,
      zelle_contact: (row.zelle_email ?? row.zelle_contact ?? null) as string | null,
      users,
    };
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground">Coach Signups</h1>
        <p className="text-muted-foreground">Verify coach identities and credentials to enable bookings</p>
      </div>

      <CoachApplicationsClient applications={applications || []} />
    </div>
  );
}
