import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { hasMinPhoneDigits } from '@/lib/phone';
import { normalizeUsZipCode } from '@/lib/us-zip';

async function requireAdmin(tenantSlug: string) {
  const supabase = await createClient(tenantSlug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const authError = await requireAdmin(tenant.slug);
    if (authError) return authError;

    const admin = createAdminClient(tenant.slug);
    const { data: athlete, error } = await admin
      .from('athletes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !athlete) return NextResponse.json({ error: 'Athlete not found' }, { status: 404 });

    const { data: userRow } = await admin.from('users').select('phone, zip_code').eq('id', id).maybeSingle();
    return NextResponse.json({
      athlete: {
        ...athlete,
        phone: userRow?.phone ?? null,
        zip_code: userRow?.zip_code ?? null,
      },
    });
  } catch (e) {
    console.error('Admin GET athlete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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

    const authError = await requireAdmin(tenant.slug);
    if (authError) return authError;

    const body = await req.json().catch(() => ({})) as {
      active?: boolean;
      first_name?: string;
      last_name?: string;
      school?: string;
      facility_id?: string | null;
      secondary_facility_id?: string | null;
      year?: string | null;
      weight_class?: string | null;
      bio?: string | null;
      credentials?: Record<string, unknown> | null;
      photo_url?: string | null;
      photo_focus_x?: number;
      photo_focus_y?: number;
      share_photo_scale?: number;
      share_photo_offset_x?: number;
      share_photo_offset_y?: number;
      venmo_handle?: string | null;
      zelle_email?: string | null;
      /** Coach account cell; stored on `users.phone`. */
      phone?: string | null;
      /** Home ZIP; stored on `users.zip_code`. */
      zip_code?: string | null;
      zipCode?: string | null;
    };
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.active === 'boolean') updates.active = body.active;
    if (typeof body.first_name === 'string' && body.first_name.trim()) updates.first_name = body.first_name.trim();
    if (typeof body.last_name === 'string' && body.last_name.trim()) updates.last_name = body.last_name.trim();
    if (typeof body.school === 'string' && body.school.trim()) updates.school = body.school.trim();
    if (body.facility_id !== undefined) updates.facility_id = body.facility_id === null || body.facility_id === '' ? null : body.facility_id;
    if (body.secondary_facility_id !== undefined) updates.secondary_facility_id = body.secondary_facility_id === null || body.secondary_facility_id === '' ? null : body.secondary_facility_id;
    if (body.year !== undefined) updates.year = body.year === null || body.year === '' ? null : body.year;
    if (body.weight_class !== undefined) updates.weight_class = body.weight_class === null || body.weight_class === '' ? null : body.weight_class;
    if (body.bio !== undefined) updates.bio = body.bio === null || body.bio === '' ? null : body.bio;
    if (body.credentials !== undefined) updates.credentials = body.credentials;
    if (body.photo_url !== undefined) updates.photo_url = body.photo_url === null || body.photo_url === '' ? null : body.photo_url;
    if (typeof body.photo_focus_x === 'number') updates.photo_focus_x = Math.min(100, Math.max(0, Math.round(body.photo_focus_x)));
    if (typeof body.photo_focus_y === 'number') updates.photo_focus_y = Math.min(100, Math.max(0, Math.round(body.photo_focus_y)));
    if (typeof body.share_photo_scale === 'number') {
      updates.share_photo_scale = Math.min(150, Math.max(50, Math.round(body.share_photo_scale)));
    }
    if (typeof body.share_photo_offset_x === 'number') {
      updates.share_photo_offset_x = Math.min(200, Math.max(-200, Math.round(body.share_photo_offset_x)));
    }
    if (typeof body.share_photo_offset_y === 'number') {
      updates.share_photo_offset_y = Math.min(200, Math.max(-200, Math.round(body.share_photo_offset_y)));
    }
    if (body.venmo_handle !== undefined) updates.venmo_handle = body.venmo_handle === null || body.venmo_handle === '' ? null : body.venmo_handle;
    if (body.zelle_email !== undefined) updates.zelle_email = body.zelle_email === null || body.zelle_email === '' ? null : body.zelle_email;

    const admin = createAdminClient(tenant.slug);

    const userContact: Record<string, string | null> = {};
    if (body.phone !== undefined) {
      const trimmed = body.phone === null || body.phone === '' ? '' : String(body.phone).trim();
      if (trimmed === '') userContact.phone = null;
      else if (!hasMinPhoneDigits(trimmed)) {
        return NextResponse.json(
          { error: 'Cell phone must include at least 10 digits' },
          { status: 400 }
        );
      } else userContact.phone = trimmed;
    }
    const zipRaw = body.zip_code !== undefined ? body.zip_code : body.zipCode;
    if (zipRaw !== undefined) {
      if (zipRaw === null || String(zipRaw).trim() === '') userContact.zip_code = null;
      else {
        const z = normalizeUsZipCode(String(zipRaw));
        if (!z) {
          return NextResponse.json({ error: 'Enter a valid U.S. ZIP (5 digits or ZIP+4).' }, { status: 400 });
        }
        userContact.zip_code = z;
      }
    }
    if (Object.keys(userContact).length > 0) {
      const { error: userErr } = await admin.from('users').update(userContact).eq('id', id);
      if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
    }

    let { data: athlete, error } = await admin
      .from('athletes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    // Some deployments can briefly trail optional share-graphic migrations.
    // Do not block core coach edits (locations, contact info, status) because
    // those presentation-only columns are missing from PostgREST's cache.
    if (
      error &&
      /share_photo_(?:scale|offset_x|offset_y)/i.test(error.message)
    ) {
      delete updates.share_photo_scale;
      delete updates.share_photo_offset_x;
      delete updates.share_photo_offset_y;
      const retry = await admin
        .from('athletes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      athlete = retry.data;
      error = retry.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!athlete) return NextResponse.json({ error: 'Athlete not found' }, { status: 404 });

    const { data: userAfter } = await admin.from('users').select('phone, zip_code').eq('id', id).maybeSingle();
    return NextResponse.json({
      athlete: {
        ...athlete,
        phone: userAfter?.phone ?? null,
        zip_code: userAfter?.zip_code ?? null,
      },
    });
  } catch (e) {
    console.error('Admin PATCH athlete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const authError = await requireAdmin(tenant.slug);
    if (authError) return authError;

    const admin = createAdminClient(tenant.slug);

    const { data: athlete } = await admin.from('athletes').select('id').eq('id', id).single();
    if (!athlete) return NextResponse.json({ error: 'Athlete not found' }, { status: 404 });

    await admin.from('coach_follows').delete().eq('coach_id', id);
    const { error: delError } = await admin.from('athletes').delete().eq('id', id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

    await admin.from('users').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Admin DELETE athlete error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
