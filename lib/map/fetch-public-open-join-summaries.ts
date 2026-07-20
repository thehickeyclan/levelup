import { createAdminClient } from '@/lib/supabase/admin';
import { getEffectiveFilledCount, isSessionOpenForParentBrowse } from '@/lib/sessions';
import { formatEST } from '@/lib/format-date';

/** One table row per upcoming scheduled session (not collapsed per coach). */
export type PublicOpenJoinSessionRow = {
  sessionId: string;
  coachId: string;
  coachName: string;
  kind: 'Private' | 'Partner' | 'Small group';
  scheduledAt: string;
  facilityName: string;
  /** Capacity context: athletes already booked vs room left. */
  openingsLabel: string;
  openSlots: number;
  isJoinable: boolean;
  sessionType: string | null;
  pricePerParticipant: number | null;
};

/** @deprecated Use PublicOpenJoinSessionRow; kept for any external imports. */
export type PublicCoachOpenJoinRow = PublicOpenJoinSessionRow;

function coachNameFromSession(s: {
  athletes?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
}): string {
  const a = s.athletes;
  const o = Array.isArray(a) ? a[0] : a;
  const n = [o?.first_name, o?.last_name].filter(Boolean).join(' ').trim();
  return n || 'Coach';
}

function facilityNameFromSession(s: {
  facilities?: { name?: string } | { name?: string }[] | null;
}): string {
  const f = s.facilities;
  const fo = Array.isArray(f) ? f[0] : f;
  return fo?.name?.trim() || '—';
}

type SessionRow = {
  id: string;
  scheduled_datetime: string;
  session_type: string | null;
  session_mode: string | null;
  join_policy: string | null;
  current_participants: number | null;
  max_participants: number | null;
  price_per_participant?: number | null;
  athlete_id: string;
  athletes?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
  facilities?: { name?: string } | { name?: string }[] | null;
  session_participants?: unknown[] | null;
};

function labelKind(session_type: string | null, session_mode: string | null): 'Private' | 'Partner' | 'Small group' {
  const sm = (session_mode ?? '').toLowerCase();
  const st = (session_type ?? '').toLowerCase();
  if (sm === 'private' || st === '1-on-1' || st === 'private') return 'Private';
  if (sm === 'partner-open' || st === '2-athlete' || st === 'partner') return 'Partner';
  return 'Small group';
}

function openingsLabelFromSession(s: SessionRow, kind: PublicOpenJoinSessionRow['kind']): string {
  const max = s.max_participants;
  const filled = getEffectiveFilledCount(s);
  if (max != null && max > 0) {
    const open = max - filled;
    if (open <= 0) return kind === 'Private' ? 'Booked' : `Full · ${filled}/${max}`;
    return `${filled} booked · ${open} open`;
  }
  if (filled >= 1) {
    return `${filled} athlete${filled === 1 ? '' : 's'} booked · spots available`;
  }
  return 'Spots available';
}

const SESSION_SELECT = `
  id,
  scheduled_datetime,
  session_type,
  session_mode,
  join_policy,
  current_participants,
  max_participants,
  price_per_participant,
  athlete_id,
  athletes(id, first_name, last_name),
  facilities(id, name, address),
  session_participants(id, youth_wrestler_id)
`;

export type PublicOpenJoinSummariesResult = {
  rows: PublicOpenJoinSessionRow[];
  /** Counts of individual open join-in sessions whose start time falls on the current Eastern calendar day. */
  openSessionCountTodayByFilter: {
    all: number;
    partner: number;
    small_group: number;
  };
};

/** Upcoming scheduled training for the marketing/home table. Service role on server only. */
export async function fetchPublicOpenJoinSummaries(
  tenantSlug: string,
  options?: { daysAhead?: number; /** Max table rows (sessions), not unique coaches. */ maxCoaches?: number }
): Promise<PublicOpenJoinSummariesResult> {
  const days = options?.daysAhead ?? 21;
  const maxSessions = options?.maxCoaches ?? 50;
  const admin = createAdminClient(tenantSlug);
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + days);
  const from = now.toISOString();
  const to = until.toISOString();

  const sessionsRes = await admin
    .from('sessions')
    .select(SESSION_SELECT)
    .eq('status', 'scheduled')
    .gte('scheduled_datetime', from)
    .lte('scheduled_datetime', to)
    .order('scheduled_datetime', { ascending: true });

  if (sessionsRes.error) console.error('[fetchPublicOpenJoinSummaries]', sessionsRes.error);
  const scheduled = (sessionsRes.data ?? []) as SessionRow[];
  const open = scheduled.filter((s) => isSessionOpenForParentBrowse(s));

  const todayYmd = formatEST(new Date(), 'yyyy-MM-dd');
  const sessionYmd = (s: SessionRow) => formatEST(s.scheduled_datetime, 'yyyy-MM-dd');
  let todayAll = 0;
  let todayPartner = 0;
  let todaySmallGroup = 0;
  for (const s of open) {
    if (sessionYmd(s) !== todayYmd) continue;
    todayAll += 1;
    if (labelKind(s.session_type, s.session_mode) === 'Partner') todayPartner += 1;
    else todaySmallGroup += 1;
  }

  const out: PublicOpenJoinSessionRow[] = [];
  for (const s of scheduled) {
    const coachId = s.athlete_id;
    if (!coachId) continue;
    const kind = labelKind(s.session_type, s.session_mode);
    const label = openingsLabelFromSession(s, kind);
    const max = s.max_participants ?? 1;
    const filled = getEffectiveFilledCount(s);
    out.push({
      sessionId: s.id,
      coachId,
      coachName: coachNameFromSession(s),
      kind,
      scheduledAt: s.scheduled_datetime,
      facilityName: facilityNameFromSession(s),
      openingsLabel: label,
      openSlots: Math.max(0, max - filled),
      isJoinable: isSessionOpenForParentBrowse(s),
      sessionType: s.session_type,
      pricePerParticipant:
        typeof s.price_per_participant === 'number' ? s.price_per_participant : null,
    });
  }

  out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return {
    rows: out.slice(0, maxSessions),
    openSessionCountTodayByFilter: {
      all: todayAll,
      partner: todayPartner,
      small_group: todaySmallGroup,
    },
  };
}
