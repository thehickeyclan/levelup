import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { resolveAthleteSmsPhone, resolveParentSmsPhone } from '@/lib/session-group-sms';
import { displayNameFromSessionParticipant } from '@/lib/session-participant-display-name';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);

  if (!tenant) {
    return NextResponse.json({ error: 'Invalid tenant' }, { status: 400 });
  }

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const { data: session } = await supabase
    .from('sessions')
    .select('athlete_id')
    .eq('id', sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (userData?.role !== 'admin' && session.athlete_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient(tenant.slug);

  const { data: participants, error } = await admin
    .from('session_participants')
    .select(`
      id,
      youth_wrestler_id,
      parent_id,
      roster_first_name,
      roster_last_name,
      youth_wrestlers (
        id,
        first_name,
        last_name,
        phone,
        date_of_birth,
        weight_class
      )
    `)
    .eq('session_id', sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const parentIds = [...new Set((participants ?? []).map((p) => p.parent_id).filter(Boolean))];
  const { data: parents } =
    parentIds.length > 0
      ? await admin.from('users').select('id, first_name, last_name, phone').in('id', parentIds)
      : { data: [] };

  const contacts = await Promise.all(
    (participants ?? []).map(async (reg) => {
      const ywRaw = Array.isArray(reg.youth_wrestlers) ? reg.youth_wrestlers[0] : reg.youth_wrestlers;
      const parent = parents?.find((p) => p.id === reg.parent_id);
      const ywId = reg.youth_wrestler_id as string | null;
      const parentId = reg.parent_id as string | null;

      const displayName = displayNameFromSessionParticipant(reg);
      const athletePhone = ywId ? await resolveAthleteSmsPhone(admin, ywId) : null;
      const parentPhone = parentId ? await resolveParentSmsPhone(admin, parentId, ywId) : null;

      const athleteFromJoin = ywRaw
        ? {
            id: ywRaw.id as string,
            firstName: (ywRaw.first_name as string) ?? '',
            lastName: (ywRaw.last_name as string) ?? '',
            phone: athletePhone,
            dateOfBirth: (ywRaw.date_of_birth as string | null) ?? null,
            weightClass: (ywRaw.weight_class as string | null) ?? null,
          }
        : displayName
          ? {
              id: ywId ?? reg.id,
              firstName: displayName.split(' ')[0] ?? displayName,
              lastName: displayName.split(' ').slice(1).join(' '),
              phone: athletePhone,
              dateOfBirth: null as string | null,
              weightClass: null as string | null,
            }
          : null;

      return {
        participantId: reg.id,
        athlete: athleteFromJoin,
        parent: parent
          ? {
              id: parent.id as string,
              firstName: (parent.first_name as string) ?? '',
              lastName: (parent.last_name as string) ?? '',
              phone: parentPhone,
            }
          : null,
      };
    })
  );

  return NextResponse.json({ contacts });
}
