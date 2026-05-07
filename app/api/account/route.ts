import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { normalizeUsZipCode } from '@/lib/us-zip';
import { validateRequiredCellPhone } from '@/lib/phone';

/** PATCH: update current user's profile (phone, home ZIP). Phone cannot be cleared once set. */
export async function PATCH(req: Request) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const updates: Record<string, string | null> = {};

    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      const v = validateRequiredCellPhone(body.phone);
      if (!v.ok) {
        return NextResponse.json({ error: v.message }, { status: 400 });
      }
      updates.phone = v.phone;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'zip_code') || Object.prototype.hasOwnProperty.call(body, 'zipCode')) {
      const raw = (body.zip_code ?? body.zipCode) as string | null | undefined;
      if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
        return NextResponse.json({ error: 'Home ZIP code is required for maps and nearby features.' }, { status: 400 });
      }
      if (typeof raw === 'string') {
        const n = normalizeUsZipCode(raw);
        if (!n) {
          return NextResponse.json({ error: 'Enter a valid U.S. ZIP code (5 digits or ZIP+4).' }, { status: 400 });
        }
        updates.zip_code = n;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { error } = await supabase.from('users').update(updates).eq('id', user.id);

    if (error) {
      console.error('Account PATCH error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (updates.phone && tenant.slug) {
      const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
      if ((me as { role?: string } | null)?.role === 'youth_wrestler') {
        const admin = createAdminClient(tenant.slug);
        await admin.from('youth_wrestlers').update({ phone: updates.phone }).eq('id', user.id);
      }
    }
    return NextResponse.json({ ok: true, ...updates });
  } catch (e) {
    console.error('Account PATCH error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
