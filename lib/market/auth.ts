import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';

export async function requireMarketUser() {
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) {
    return { error: NextResponse.json({ error: 'Tenant not found' }, { status: 404 }) };
  }

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const role = userData?.role;
  if (!role || role === 'admin') {
    // admin allowed
  } else if (!['parent', 'coach', 'youth_wrestler'].includes(role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { supabase, tenant, user, role: role as string };
}

/**
 * Public-market variant: resolves the tenant and the user if one is signed in.
 * Anonymous readers get the admin client for reads (RLS select is
 * authenticated-only) — callers MUST keep anon queries to public data.
 */
export async function optionalMarketUser() {
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) {
    return { error: NextResponse.json({ error: 'Tenant not found' }, { status: 404 }) } as const;
  }
  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  const db = user ? supabase : createAdminClient(tenant.slug);
  return { tenant, user: user ?? null, supabase, db } as const;
}
