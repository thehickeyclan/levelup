import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import {
  buildSessionRosterParticipant,
  type SessionRosterParticipant,
} from '@/lib/wrestler-roster-display';

export async function POST(req: NextRequest) {
  try {
    const hdrs = await headers();
    const host = hdrs.get('host') ?? '';
    const tenant = getTenantByDomain(host);

    if (!tenant) {
      return NextResponse.json({ names: {}, rosters: {} });
    }

    const body = await req.json();
    const rawIds = body?.sessionIds;

    if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ names: {}, rosters: {} });
    }

    const sessionIds = rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (sessionIds.length === 0) {
      return NextResponse.json({ names: {}, rosters: {} });
    }

    const admin = createAdminClient(tenant.slug);
    const names: Record<string, string> = {};
    const rosters: Record<string, SessionRosterParticipant[]> = {};

    const { data: sessionsData } = await admin
      .from('sessions')
      .select('id, session_participants(id, youth_wrestler_id, roster_first_name, roster_last_name)')
      .in('id', sessionIds);

    if (!sessionsData || sessionsData.length === 0) {
      return NextResponse.json({ names: {}, rosters: {} });
    }

    const allYouthIds: string[] = [];
    for (const session of sessionsData) {
      const raw = session.session_participants;
      const participants = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const p of participants) {
        const youthId = (p as Record<string, unknown>).youth_wrestler_id as string | null;
        if (youthId) allYouthIds.push(youthId);
      }
    }

    const wrestlerMap: Record<
      string,
      {
        first_name?: string | null;
        last_name?: string | null;
        age?: number | null;
        weight_class?: string | null;
        skill_level?: string | null;
        graduation_year?: number | null;
      }
    > = {};

    if (allYouthIds.length > 0) {
      const uniqueYouthIds = [...new Set(allYouthIds)];
      const { data: wrestlers } = await admin
        .from('youth_wrestlers')
        .select('id, first_name, last_name, age, weight_class, skill_level, graduation_year')
        .in('id', uniqueYouthIds);

      for (const w of wrestlers ?? []) {
        wrestlerMap[w.id] = w;
      }
    }

    for (const session of sessionsData) {
      const raw = session.session_participants;
      const participants = Array.isArray(raw) ? raw : raw ? [raw] : [];

      const sessionRoster: SessionRosterParticipant[] = [];
      for (const p of participants) {
        const row = p as {
          youth_wrestler_id?: string | null;
          roster_first_name?: string | null;
          roster_last_name?: string | null;
        };
        const youthId = row.youth_wrestler_id;
        const yw = youthId ? wrestlerMap[youthId] : null;
        const built = buildSessionRosterParticipant(
          yw ?? {
            first_name: row.roster_first_name,
            last_name: row.roster_last_name,
          }
        );
        if (built) sessionRoster.push(built);
      }

      if (sessionRoster.length > 0) {
        rosters[session.id] = sessionRoster;
        names[session.id] = sessionRoster.map((r) => r.name).join(', ');
      }
    }

    return NextResponse.json({ names, rosters });
  } catch (err) {
    console.error('Error fetching participant names:', err);
    return NextResponse.json({ names: {}, rosters: {} });
  }
}
