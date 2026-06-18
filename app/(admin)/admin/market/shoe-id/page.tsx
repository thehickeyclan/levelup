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
    .select(
      'id, brand, model, years_produced, rarity, original_msrp_cents, value_low_cents, value_mid_cents, value_high_cents, verified, source, reference_image_urls, sale_comps'
    )
    .order('brand')
    .order('model');

  const catalogRows = (catalog ?? []).map((row) => ({
    id: row.id,
    brand: row.brand,
    model: row.model,
    years_produced: row.years_produced,
    rarity: row.rarity,
    original_msrp_cents: row.original_msrp_cents,
    value_low_cents: row.value_low_cents,
    value_mid_cents: row.value_mid_cents,
    value_high_cents: row.value_high_cents,
    verified: row.verified ?? false,
    source: row.source,
    reference_image_count: row.reference_image_urls?.length ?? 0,
    sale_comp_count: Array.isArray(row.sale_comps) ? row.sale_comps.length : 0,
  }));

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
      <ShoeIdAdminClient initialCatalog={catalogRows} />
    </div>
  );
}
