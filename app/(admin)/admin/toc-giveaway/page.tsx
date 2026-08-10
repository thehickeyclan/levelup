import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { TocGiveawayClient, type TocGiveawayEntry } from './toc-giveaway-client';

export default async function AdminTocGiveawayPage() {
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
  const { data, error } = await admin
    .from('toc_giveaway_entries')
    .select(
      'id, campaign, user_id, email, first_name, last_name, phone, zip_code, eligible, winner, credit_granted, credit_id, created_at, selected_at, credited_at'
    )
    .order('created_at', { ascending: false });

  if (error) console.error('TOC giveaway entries fetch error:', error);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <BackLink fallbackHref="/admin" label="Back to Admin" />
      </div>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground">Tournament of Champions Giveaway</h1>
        <p className="mt-1 text-muted-foreground">
          Track eligible wrestler signups, select the 10 winners, and grant $100 Guild training credits.
        </p>
      </div>
      <TocGiveawayClient initialEntries={((data ?? []) as TocGiveawayEntry[])} />
    </div>
  );
}
