import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatEST } from '@/lib/format-date';

type VolunteerRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  club_or_school?: string | null;
  primary_role: string;
  additional_roles?: string[] | null;
  availability?: string | null;
  message?: string | null;
  created_at: string;
};

export default async function AdminTournamentVolunteersPage() {
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
  if (userData?.role !== 'admin') redirect('/');

  const admin = createAdminClient(tenant.slug);
  const { data: rows, error } = await admin
    .from('tournament_volunteers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Tournament volunteers fetch error:', error);
  }

  const list = (rows ?? []) as VolunteerRow[];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <BackLink fallbackHref="/admin" label="Back to Admin" />
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-serif text-foreground">Tournament Volunteers</h1>
        <p className="text-muted-foreground mt-1">
          Volunteer signups from the Tournament of Champions page
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All signups</CardTitle>
          <CardDescription>
            {list.length} volunteer{list.length !== 1 ? 's' : ''}. Newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-muted-foreground">No volunteers yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-medium">Submitted</th>
                    <th className="p-2 font-medium">Name</th>
                    <th className="p-2 font-medium">Email</th>
                    <th className="p-2 font-medium">Phone</th>
                    <th className="p-2 font-medium">Club / School</th>
                    <th className="p-2 font-medium">Helps most</th>
                    <th className="p-2 font-medium">Also open to</th>
                    <th className="p-2 font-medium">Availability</th>
                    <th className="p-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="p-2 text-muted-foreground whitespace-nowrap">
                        {formatEST(new Date(r.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.email}</td>
                      <td className="p-2">{r.phone ?? '—'}</td>
                      <td className="p-2">{r.club_or_school ?? '—'}</td>
                      <td className="p-2 font-medium">{r.primary_role}</td>
                      <td className="p-2 text-muted-foreground">
                        {r.additional_roles && r.additional_roles.length > 0
                          ? r.additional_roles.join(', ')
                          : '—'}
                      </td>
                      <td className="p-2">{r.availability ?? '—'}</td>
                      <td className="p-2 text-muted-foreground max-w-xs whitespace-pre-wrap">
                        {r.message ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
