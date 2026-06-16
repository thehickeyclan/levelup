import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { validateRequiredYouthPhone } from '@/lib/phone';
import { normalizeUsZipCode } from '@/lib/us-zip';
import {
  GRADUATION_YEAR_REQUIRED_MESSAGE,
  parseGraduationYear,
} from '@/lib/graduation-year';

// GET - List all youth wrestlers for the authenticated parent
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a parent
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'parent') {
      return NextResponse.json(
        {
          error:
            'Wrestler profiles are managed from a parent account. Sign in with a parent login, or contact us if you need help switching your account type.',
        },
        { status: 403 }
      );
    }

    // Get all youth wrestlers this parent can see (primary or linked via youth_wrestler_parents)
    const { data: youthWrestlers, error } = await supabase
      .from('youth_wrestlers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ youthWrestlers: youthWrestlers || [] });
  } catch (error) {
    console.error('Error fetching youth wrestlers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new youth wrestler
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const supabase = await createClient(tenant.slug);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is a parent
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'parent') {
      return NextResponse.json(
        {
          error:
            'Only parent accounts can add a wrestler profile. If you signed up as a wrestler or coach by mistake, contact us and we can help.',
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      firstName,
      lastName,
      dateOfBirth,
      school,
      graduationYear,
      weightClass,
      skillLevel,
      wrestlingExperience,
      goals,
      medicalNotes,
      photoUrl,
      allowDuplicate,
      phone,
      zipCode,
    } = body;

    const phoneCheck = validateRequiredYouthPhone(phone);
    if (!phoneCheck.ok) {
      return NextResponse.json({ error: phoneCheck.message }, { status: 400 });
    }

    const zipNorm = normalizeUsZipCode(typeof zipCode === 'string' ? zipCode : '');
    if (!zipNorm) {
      return NextResponse.json(
        { error: 'A valid U.S. home ZIP code is required for this athlete (5 digits or ZIP+4).' },
        { status: 400 }
      );
    }

    const graduationYearParsed = parseGraduationYear(graduationYear);
    if (graduationYearParsed == null) {
      return NextResponse.json({ error: GRADUATION_YEAR_REQUIRED_MESSAGE }, { status: 400 });
    }

    const norm = (s: string) => (s ?? '').trim().toLowerCase();
    const firstNorm = norm(firstName);
    const lastNorm = norm(lastName);

    if (!allowDuplicate && firstNorm && lastNorm) {
      // All youth wrestlers this parent can see (primary or linked)
      const { data: primaryRows } = await supabase
        .from('youth_wrestlers')
        .select('id, first_name, last_name')
        .eq('parent_id', user.id);
      const { data: linkedIds } = await supabase
        .from('youth_wrestler_parents')
        .select('youth_wrestler_id')
        .eq('parent_id', user.id);
      const linkedIdList = [...new Set((linkedIds ?? []).map((r: { youth_wrestler_id: string }) => r.youth_wrestler_id))];
      const { data: linkedRows } = linkedIdList.length > 0
        ? await supabase
            .from('youth_wrestlers')
            .select('id, first_name, last_name')
            .in('id', linkedIdList)
        : { data: [] };
      type FamilyRow = { id: string; first_name?: string; last_name?: string };
      const family: FamilyRow[] = [...(primaryRows ?? []), ...(linkedRows ?? [])];
      const deduped: FamilyRow[] = [...new Map(family.map((r) => [r.id, r])).values()];
      const duplicate = deduped.find(
        (r) => norm(r.first_name ?? '') === firstNorm && norm(r.last_name ?? '') === lastNorm
      );
      if (duplicate) {
        return NextResponse.json(
          {
            code: 'DUPLICATE_PROFILE',
            message: `A profile for ${(firstName ?? '').trim()} ${(lastName ?? '').trim()} already exists.`,
            duplicateOf: { id: duplicate.id, first_name: duplicate.first_name, last_name: duplicate.last_name },
          },
          { status: 409 }
        );
      }
    }

    // Calculate age from date of birth
    let age: number | null = null;
    if (dateOfBirth) {
      const birthDate = new Date(dateOfBirth);
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
    }

    // Create youth wrestler
    const { data: youthWrestler, error } = await supabase
      .from('youth_wrestlers')
      .insert({
        parent_id: user.id,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dateOfBirth || null,
        age: age,
        school: school || null,
        graduation_year: graduationYearParsed,
        weight_class: weightClass || null,
        skill_level: skillLevel || null,
        wrestling_experience: wrestlingExperience || null,
        goals: goals || null,
        medical_notes: medicalNotes || null,
        photo_url: photoUrl || null,
        phone: phoneCheck.phone,
        zip_code: zipNorm,
        active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ youthWrestler });
  } catch (error) {
    console.error('Error creating youth wrestler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}





