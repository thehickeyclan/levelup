import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { validateRequiredYouthPhone } from '@/lib/phone';
import { normalizeUsZipCode } from '@/lib/us-zip';
import {
  GRADUATION_YEAR_REQUIRED_MESSAGE,
  parseGraduationYear,
} from '@/lib/graduation-year';

async function requireAdmin(tenantSlug: string) {
  const supabase = await createClient(tenantSlug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** GET - list all youth wrestlers (kids) for admin. */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const authError = await requireAdmin(tenant.slug);
    if (authError) return authError;

    const admin = createAdminClient(tenant.slug);
    const { data: kids, error } = await admin
      .from('youth_wrestlers')
      .select('id, first_name, last_name, school, weight_class, skill_level, graduation_year, parent_id, photo_url, created_at')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const parentIds = [...new Set((kids ?? []).map((k) => k.parent_id))];
    const parentEmails = new Map<string, string>();
    if (parentIds.length > 0) {
      const { data: users } = await admin
        .from('users')
        .select('id, email')
        .in('id', parentIds);
      for (const u of users ?? []) {
        parentEmails.set(u.id, u.email ?? '—');
      }
    }

    const list = (kids ?? []).map((k) => ({
      id: k.id,
      first_name: k.first_name,
      last_name: k.last_name,
      school: k.school ?? null,
      weight_class: k.weight_class ?? null,
      skill_level: k.skill_level ?? null,
      graduation_year: k.graduation_year ?? null,
      parent_id: k.parent_id,
      parent_email: parentEmails.get(k.parent_id) ?? '—',
      photo_url: k.photo_url ?? null,
      created_at: k.created_at,
    }));

    return NextResponse.json({ youthWrestlers: list });
  } catch (e) {
    console.error('Admin youth-wrestlers GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST - create a youth wrestler on a parent account (no SQL). */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const authError = await requireAdmin(tenant.slug);
    if (authError) return authError;

    const body = (await req.json()) as {
      parentId?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      zipCode?: string;
      weightClass?: string;
      school?: string;
      graduationYear?: number | string;
      dateOfBirth?: string;
    };

    const parentId = typeof body.parentId === 'string' ? body.parentId.trim() : '';
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';

    if (!parentId || !firstName || !lastName) {
      return NextResponse.json({ error: 'parentId, firstName, and lastName are required' }, { status: 400 });
    }

    const phoneCheck = validateRequiredYouthPhone(body.phone);
    if (!phoneCheck.ok) {
      return NextResponse.json({ error: phoneCheck.message }, { status: 400 });
    }

    const zipNorm = normalizeUsZipCode(typeof body.zipCode === 'string' ? body.zipCode : '');
    if (!zipNorm) {
      return NextResponse.json({ error: 'A valid U.S. home ZIP is required (5 digits or ZIP+4)' }, { status: 400 });
    }

    const graduationYear = parseGraduationYear(body.graduationYear);
    if (graduationYear == null) {
      return NextResponse.json({ error: GRADUATION_YEAR_REQUIRED_MESSAGE }, { status: 400 });
    }

    const admin = createAdminClient(tenant.slug);

    const { data: parent } = await admin.from('users').select('id, role').eq('id', parentId).maybeSingle();
    if (!parent || parent.role !== 'parent') {
      return NextResponse.json({ error: 'Parent account not found' }, { status: 404 });
    }

    let age: number | null = null;
    const dob = typeof body.dateOfBirth === 'string' && body.dateOfBirth.trim() ? body.dateOfBirth.trim() : null;
    if (dob) {
      const birthDate = new Date(dob);
      if (!Number.isNaN(birthDate.getTime())) {
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      }
    }

    const { data: youthWrestler, error } = await admin
      .from('youth_wrestlers')
      .insert({
        parent_id: parentId,
        first_name: firstName,
        last_name: lastName,
        phone: phoneCheck.phone,
        zip_code: zipNorm,
        weight_class: typeof body.weightClass === 'string' ? body.weightClass.trim() || null : null,
        school: typeof body.school === 'string' ? body.school.trim() || null : null,
        graduation_year: graduationYear,
        date_of_birth: dob,
        age,
        active: true,
      })
      .select('id, first_name, last_name, parent_id, weight_class, school')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ youthWrestler });
  } catch (e) {
    console.error('Admin youth-wrestlers POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
