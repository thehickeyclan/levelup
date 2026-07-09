import { formatEST } from '@/lib/format-date';
import { getEffectiveFilledCount } from '@/lib/sessions';
import { coachPublicScheduleUrl } from '@/lib/coach-public-schedule-url';
import { truncateUpper } from './build-overlay-svg';

export type ShareGraphicSessionSlot = {
  timeLabel: string;
  statusLabel: string;
  dayAbbrev?: string;
};

/** Bottom label on a slot when sessions span multiple calendar days. */
export function shareGraphicSlotDayLabel(
  dt: Date,
  multiDay: boolean,
  visible: SessionRow[]
): string | undefined {
  if (!multiDay) return undefined;

  const weekday = formatEST(dt, 'EEE').toUpperCase();
  const time = formatEST(dt, 'h:mm a').toUpperCase();

  let weekdayCount = 0;
  let timeCount = 0;
  for (const s of visible) {
    const d = new Date(s.scheduled_datetime);
    if (formatEST(d, 'EEE').toUpperCase() === weekday) weekdayCount++;
    if (formatEST(d, 'h:mm a').toUpperCase() === time) timeCount++;
  }

  // Same weekday (e.g. three Sundays) or same time → show calendar date so slots don't look identical.
  if (weekdayCount > 1 || timeCount > 1) {
    return formatEST(dt, 'MMM d').toUpperCase();
  }

  return weekday;
}

type SessionRow = {
  scheduled_datetime: string;
  session_type?: string | null;
  session_mode?: string | null;
  max_participants?: number | null;
  current_participants?: number | null;
  join_policy?: string | null;
  session_participants?: unknown[] | null;
};

function sessionTypeKey(
  sessionType: string | null | undefined,
  sessionMode: string | null | undefined
): 'small_group' | 'partner' | 'private' {
  if (sessionType === 'group' || sessionType === 'small_group') return 'small_group';
  if (sessionType === '2-athlete' || sessionType === 'partner') return 'partner';
  if (sessionType === '1-on-1' || sessionType === 'private') return 'private';
  if (sessionMode === 'partner-open' || sessionMode === 'partner-invite') return 'partner';
  return 'private';
}

export function shareGraphicStatusLabel(session: SessionRow): string {
  const typeKey = sessionTypeKey(session.session_type, session.session_mode);
  const max = Number(session.max_participants) || 1;
  const filled = getEffectiveFilledCount(session);
  const open = Math.max(0, max - filled);

  if (open <= 0) return 'FULL';
  if (typeKey === 'private') return 'PRIVATE';
  if (typeKey === 'partner') return open === 1 ? '1 SPOT' : '2 SPOTS';
  return `${open} SPOT${open === 1 ? '' : 'S'}`;
}

export function buildShareGraphicSessionSlots(
  sessions: SessionRow[],
  opts?: { maxSlots?: number }
): { slots: ShareGraphicSessionSlot[]; overflowCount: number } {
  const maxSlots = opts?.maxSlots ?? 4;
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
  );
  const visible = sorted.slice(0, maxSlots);
  const overflowCount = Math.max(0, sorted.length - visible.length);

  const uniqueDays = new Set(
    visible.map((s) => formatEST(new Date(s.scheduled_datetime), 'yyyy-MM-dd'))
  );
  const multiDay = uniqueDays.size > 1;

  const slots: ShareGraphicSessionSlot[] = visible.map((s) => {
    const dt = new Date(s.scheduled_datetime);
    return {
      timeLabel: formatEST(dt, 'h:mm a').toUpperCase(),
      statusLabel: truncateUpper(shareGraphicStatusLabel(s), 12),
      dayAbbrev: shareGraphicSlotDayLabel(dt, multiDay, visible),
    };
  });

  return { slots, overflowCount };
}

export function shareGraphicDayHeader(sessions: SessionRow[]): string {
  if (sessions.length === 0) return 'UPCOMING SESSIONS';

  const dates = sessions.map((s) => new Date(s.scheduled_datetime));
  const dayKeys = dates.map((d) => formatEST(d, 'yyyy-MM-dd'));
  const unique = new Set(dayKeys);

  if (unique.size === 1) {
    return formatEST(dates[0]!, 'EEEE').toUpperCase();
  }

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const spanMs = sorted[sorted.length - 1]!.getTime() - sorted[0]!.getTime();
  if (spanMs <= 7 * 24 * 60 * 60 * 1000) return 'THIS WEEK';

  return 'UPCOMING SESSIONS';
}

export function shareGraphicDateRangeLabel(sessions: SessionRow[]): string {
  if (sessions.length === 0) return '';
  const dates = sessions.map((s) => new Date(s.scheduled_datetime)).sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;

  if (formatEST(first, 'yyyy-MM-dd') === formatEST(last, 'yyyy-MM-dd')) {
    return formatEST(first, 'MMMM d, yyyy').toUpperCase();
  }

  if (formatEST(first, 'yyyy') === formatEST(last, 'yyyy') && formatEST(first, 'MMMM') === formatEST(last, 'MMMM')) {
    return `${formatEST(first, 'MMMM d').toUpperCase()} – ${formatEST(last, 'd, yyyy').toUpperCase()}`;
  }

  return `${formatEST(first, 'MMM d').toUpperCase()} – ${formatEST(last, 'MMM d, yyyy').toUpperCase()}`;
}

export function shareGraphicPrimaryFacility(sessions: SessionRow[], schoolLabel: string): string {
  const names: string[] = [];
  for (const s of sessions) {
    const fac = (s as { facilities?: { name?: string } | { name?: string }[] | null }).facilities;
    const row = Array.isArray(fac) ? fac[0] : fac;
    const name = row?.name?.trim();
    if (name) names.push(name);
  }
  if (names.length === 0) return truncateUpper(schoolLabel, 42);

  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = names[0]!;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }

  const short = truncateUpper(best.replace(/\s+/g, ' '), 36);
  const school = truncateUpper(schoolLabel, 18);
  if (school && !short.toUpperCase().includes(school)) {
    return truncateUpper(`${school} ${short}`, 42);
  }
  return truncateUpper(short, 42);
}

export function shareGraphicHostname(appOrigin: string): string {
  const base = appOrigin.replace(/\/$/, '');
  try {
    return new URL(base.startsWith('http') ? base : `https://${base}`).hostname.replace(/^www\./i, '');
  } catch {
    return 'thewrestlingguild.com';
  }
}

/** Readable booking line on the PNG — QR carries the full coach schedule URL. */
export function formatShareGraphicBookingLine(appOrigin: string, _coachId: string): string {
  const host = shareGraphicHostname(appOrigin).toUpperCase();
  return `SCAN TO BOOK · ${host}`;
}

export function shareGraphicBookingUrl(appOrigin: string, coachId: string): string {
  return coachPublicScheduleUrl(appOrigin, coachId);
}
