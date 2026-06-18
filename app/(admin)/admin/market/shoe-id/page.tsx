import { redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { ShoeIdAdminClient } from './shoe-id-admin-client';

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  return new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export default async function AdminShoeIdPage() {
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
  if (userData?.role !== 'admin') {
    const adminEmails = getAdminEmails();
    if (!adminEmails.has((user.email ?? '').toLowerCase())) redirect('/');
  }

  const admin = createAdminClient(tenant.slug);
  const { data: catalog } = await admin
    .from('wrestling_shoes_catalog')
    .select('id, brand, model, years_produced, rarity, value_low_cents, value_high_cents, verified, source')
    .order('brand')
    .order('model');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/admin/market" className="text-sm text-[#888] hover:text-white">
          ← Market admin
        </Link>
        <h1 className="text-2xl font-bold mt-2">Shoe ID Training</h1>
        <p className="text-sm text-[#666] mt-1">
          Train the wrestling shoe catalog before enabling{' '}
          <code className="text-[#C9A265]">SHOE_ID_ENABLED</code> for sellers.
        </p>
      </div>
      <ShoeIdAdminClient initialCatalog={catalog ?? []} />
    </div>
  );
}
