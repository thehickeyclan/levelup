import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { isTournamentVolunteerRole } from '@/lib/tournament/volunteer-roles';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimStr(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t.length ? t.slice(0, max) : null;
}

function sanitizeRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => isTournamentVolunteerRole(v))
    ),
  ].slice(0, 12);
}

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const host = headersList.get('host') || '';
    const tenant = getTenantByDomain(host);
    if (!tenant) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      phone?: string;
      club_or_school?: string;
      primary_role?: string;
      additional_roles?: unknown;
      availability?: string;
      message?: string;
    };

    const name = trimStr(body.name, 200);
    if (!name) {
      return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const primaryRole = trimStr(body.primary_role, 100);
    if (!primaryRole || !isTournamentVolunteerRole(primaryRole)) {
      return NextResponse.json({ error: 'Please choose where you can help most.' }, { status: 400 });
    }

    const additionalRoles = sanitizeRoles(body.additional_roles).filter((r) => r !== primaryRole);

    const admin = createAdminClient(tenant.slug);
    const { error } = await admin.from('tournament_volunteers').insert({
      name,
      email: email.toLowerCase(),
      phone: trimStr(body.phone, 30),
      club_or_school: trimStr(body.club_or_school, 200),
      primary_role: primaryRole,
      additional_roles: additionalRoles,
      availability: trimStr(body.availability, 100),
      message: trimStr(body.message, 2000),
    });

    if (error) {
      console.error('Tournament volunteer insert error:', error);
      return NextResponse.json(
        { error: 'Something went wrong. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Thank you for stepping up — we'll be in touch with next steps.",
    });
  } catch (e) {
    console.error('Tournament volunteer API error:', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
