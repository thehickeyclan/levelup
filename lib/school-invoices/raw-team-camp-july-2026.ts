import type { SupabaseClient } from '@supabase/supabase-js';
import { formatEST } from '@/lib/format-date';
import { sessionPricePerParticipantUsd } from '@/lib/session-price';

export const RAW_CAMP_WRESTLER_EMAILS = [
  'southernboy0503@icloud.com',
  'gabrieljager90@gmail.com',
  'skyersjahiem90@gmail.com',
  'glbrewer09@yahoo.com',
  'rahiem.skyers@icloud.com',
  'aidanfinn317@gmail.com',
] as const;

export const RAW_CAMP_SESSION_DATES = ['2026-07-10', '2026-07-11', '2026-07-12'] as const;

export const RAW_CAMP_UNIT_PRICE_USD = 30;
/** Current rostered camp (Liam AM+PM Sat); full camp adds Sat 4 PM coach session. */
export const RAW_CAMP_EXPECTED_SESSIONS_MIN = 7;
export const RAW_CAMP_EXPECTED_SESSIONS_MAX = 8;
export const RAW_CAMP_EXPECTED_SPOTS_MIN = 21;
export const RAW_CAMP_EXPECTED_SPOTS_MAX = 24;

/** School invoice uses camp rate when session price is unset or explicitly $0 (pre-payment). */
export function rawCampSchoolUnitPriceUsd(raw: number | null | undefined): number {
  const priced = sessionPricePerParticipantUsd(raw, RAW_CAMP_UNIT_PRICE_USD);
  return priced > 0 ? priced : RAW_CAMP_UNIT_PRICE_USD;
}

export const RAW_CAMP_INVOICE = {
  number: 'WG-2026-TEAM-0710',
  title: 'Team training — Jul 10–12, 2026',
  billFromName: 'The Wrestling Guild',
  billFromWebsite: 'www.wrestlingguild.com',
  billFromEmail: 'info@WrestlingGuild.com',
  billFromPhone: '631.662.5409',
  billToName: 'Alan Aponte',
  billToOrg: 'School team billing',
  billToNote: 'Six athletes · weekend small-group sessions',
  scheduleNote:
    'Fri–Sun Jul 10–12 · Liam, Cason, Ethan, Derek, and Nick coach sessions',
  facilityName: 'Guild coach facilities',
  facilityAddress: 'UNC & NC State wrestling facilities (per session)',
  paymentTerms: 'Payment due upon receipt.',
  paymentInstructions:
    'Pay online with the link below, or contact info@WrestlingGuild.com / 631.662.5409. Include invoice number WG-2026-TEAM-0710.',
  stripePaymentUrl: 'https://buy.stripe.com/6oUfZj2nQ8N1asv7IDgEg09',
} as const;

export type RawCampInvoiceLine = {
  sessionId: string;
  sessionDate: string;
  sessionDateLabel: string;
  sessionTimeLabel: string;
  scheduledDatetime: string;
  coachName: string;
  wrestlerName: string;
  email: string;
  unitPriceUsd: number;
  facilityName: string | null;
};

type ParticipantRow = {
  session_id: string;
  youth_wrestler_id: string;
  sessions: {
    scheduled_datetime: string;
    price_per_participant: number | null;
    athletes: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
    facilities: { name: string } | { name: string }[] | null;
  } | {
    scheduled_datetime: string;
    price_per_participant: number | null;
    athletes: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
    facilities: { name: string } | { name: string }[] | null;
  }[] | null;
  youth_wrestlers:
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchRawCampInvoiceLines(
  admin: SupabaseClient
): Promise<RawCampInvoiceLine[]> {
  const emailSet = new Set<string>(RAW_CAMP_WRESTLER_EMAILS.map((e) => e.toLowerCase()));

  const { data: users, error: usersErr } = await admin
    .from('users')
    .select('id, email')
    .in('email', [...RAW_CAMP_WRESTLER_EMAILS]);

  if (usersErr) {
    console.error('raw-camp-invoice users:', usersErr.message);
    return [];
  }

  const wrestlerIds = (users ?? [])
    .filter((u) => emailSet.has((u.email ?? '').trim().toLowerCase()))
    .map((u) => u.id);

  if (wrestlerIds.length === 0) return [];

  const emailByWrestlerId = new Map<string, string>();
  for (const u of users ?? []) {
    emailByWrestlerId.set(u.id, (u.email ?? '').trim().toLowerCase());
  }

  const { data, error } = await admin
    .from('session_participants')
    .select(
      `
      session_id,
      youth_wrestler_id,
      sessions!inner (
        scheduled_datetime,
        price_per_participant,
        athletes ( first_name, last_name ),
        facilities ( name )
      ),
      youth_wrestlers!inner (
        first_name,
        last_name
      )
    `
    )
    .in('youth_wrestler_id', wrestlerIds);

  if (error) {
    console.error('raw-camp-invoice participants:', error.message);
    return [];
  }

  const dateSet = new Set<string>(RAW_CAMP_SESSION_DATES);
  const lines: RawCampInvoiceLine[] = [];

  for (const row of (data ?? []) as ParticipantRow[]) {
    const session = one(row.sessions);
    const yw = one(row.youth_wrestlers);
    if (!session || !yw) continue;

    const email = emailByWrestlerId.get(row.youth_wrestler_id) ?? '';
    if (!email || !emailSet.has(email)) continue;

    const sessionDate = formatEST(session.scheduled_datetime, 'yyyy-MM-dd');
    if (!dateSet.has(sessionDate as (typeof RAW_CAMP_SESSION_DATES)[number])) continue;

    const coach = one(session.athletes);
    const facility = one(session.facilities);
    const coachName = coach
      ? `${coach.first_name} ${coach.last_name}`.trim()
      : 'Coach TBD';

    lines.push({
      sessionId: row.session_id,
      sessionDate,
      sessionDateLabel: formatEST(session.scheduled_datetime, 'EEE, MMM d, yyyy'),
      sessionTimeLabel: formatEST(session.scheduled_datetime, 'h:mm a'),
      scheduledDatetime: session.scheduled_datetime,
      coachName,
      wrestlerName: `${yw.first_name} ${yw.last_name}`.trim(),
      email,
      unitPriceUsd: rawCampSchoolUnitPriceUsd(session.price_per_participant),
      facilityName: facility?.name ?? null,
    });
  }

  lines.sort((a, b) => {
    const byDate = a.sessionDate.localeCompare(b.sessionDate);
    if (byDate !== 0) return byDate;
    const byCoach = a.coachName.localeCompare(b.coachName);
    if (byCoach !== 0) return byCoach;
    return a.wrestlerName.localeCompare(b.wrestlerName);
  });

  return lines;
}

export type RawCampInvoiceSessionSummary = {
  sessionId: string;
  sessionDate: string;
  sessionDateLabel: string;
  sessionTimeLabel: string;
  coachName: string;
  athleteCount: number;
  unitPriceUsd: number;
  lineTotalUsd: number;
  facilityName: string | null;
};

export function summarizeRawCampInvoiceBySession(
  lines: RawCampInvoiceLine[]
): RawCampInvoiceSessionSummary[] {
  const bySession = new Map<string, RawCampInvoiceLine[]>();
  for (const line of lines) {
    const bucket = bySession.get(line.sessionId) ?? [];
    bucket.push(line);
    bySession.set(line.sessionId, bucket);
  }

  return Array.from(bySession.entries())
    .map(([sessionId, sessionLines]) => {
      const first = sessionLines[0];
      const unitPriceUsd = first?.unitPriceUsd ?? RAW_CAMP_UNIT_PRICE_USD;
      const athleteCount = sessionLines.length;
      return {
        sessionId,
        sessionDate: first?.sessionDate ?? '',
        sessionDateLabel: first?.sessionDateLabel ?? '',
        sessionTimeLabel: first?.sessionTimeLabel ?? '',
        coachName: first?.coachName ?? 'Coach TBD',
        athleteCount,
        unitPriceUsd,
        lineTotalUsd: athleteCount * unitPriceUsd,
        facilityName: first?.facilityName ?? RAW_CAMP_INVOICE.facilityName,
      };
    })
    .sort((a, b) => {
      const byDate = a.sessionDate.localeCompare(b.sessionDate);
      if (byDate !== 0) return byDate;
      const byTime = a.sessionTimeLabel.localeCompare(b.sessionTimeLabel);
      if (byTime !== 0) return byTime;
      return a.coachName.localeCompare(b.coachName);
    });
}

export function rawCampInvoiceTotalUsd(lines: RawCampInvoiceLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPriceUsd, 0);
}
