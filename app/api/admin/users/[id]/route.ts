import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { hasMinPhoneDigits } from '@/lib/phone';
import { normalizeUsZipCode } from '@/lib/us-zip';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({})) as {
      role?: string;
      archived_at?: string | null;
      phone?: string | null;
      zip_code?: string | null;
      zipCode?: string | null;
    };
    const updates: { role?: string; archived_at?: string | null; phone?: string | null; zip_code?: string | null; updated_at?: string } =
      {};
    if (typeof body.role === 'string' && ['parent', 'coach', 'admin', 'youth_wrestler'].includes(body.role)) {
      updates.role = body.role;
    }
    if (body.archived_at !== undefined) {
      updates.archived_at = body.archived_at === null || body.archived_at === '' ? null : body.archived_at;
    }
    if (body.phone !== undefined) {
      const trimmed = body.phone === null || body.phone === '' ? '' : String(body.phone).trim();
      if (trimmed === '') {
        return NextResponse.json(
          { error: 'Cell phone is required; use a valid number with at least 10 digits.' },
          { status: 400 }
        );
      }
      if (!hasMinPhoneDigits(trimmed)) {
        return NextResponse.json(
          { error: 'Cell phone must include at least 10 digits' },
          { status: 400 }
        );
      }
      updates.phone = trimmed;
    }
    const zipRaw = body.zip_code !== undefined ? body.zip_code : body.zipCode;
    if (zipRaw !== undefined) {
      if (zipRaw === null || String(zipRaw).trim() === '') updates.zip_code = null;
      else {
        const z = normalizeUsZipCode(String(zipRaw));
        if (!z) {
          return NextResponse.json({ error: 'Enter a valid U.S. ZIP (5 digits or ZIP+4).' }, { status: 400 });
        }
        updates.zip_code = z;
      }
    }
    updates.updated_at = new Date().toISOString();

    const hasChange =
      'role' in updates ||
      'archived_at' in updates ||
      'phone' in updates ||
      'zip_code' in updates;
    if (!hasChange) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    const admin = createAdminClient(tenant.slug);
    // Do not select archived_at here — some DBs predate that migration and the column may not exist.
    const { data, error } = await admin
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, email, role, phone, zip_code')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Admin PATCH user error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (id === user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    const admin = createAdminClient(tenant.slug);
    const { error } = await admin.from('users').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.auth.admin.deleteUser(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Admin DELETE user error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
