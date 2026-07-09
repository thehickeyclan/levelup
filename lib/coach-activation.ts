import type { CoachCreateSessionType } from '@/lib/coach-session-pricing';
import {
  APP_TIMEZONE,
  easternSundayZeroDowFromYmd,
  easternWallDateTimeToUtcIso,
  formatEST,
} from '@/lib/format-date';
import { intervalsOverlapHalfOpen } from '@/lib/coach-session-overlap';
import { addDays, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export type CoachActivationStepId = 'profile' | 'rate_card' | 'calendar' | 'bookable' | 'share';

export type CoachActivationStep = {
  id: CoachActivationStepId;
  label: string;
  description: string;
  done: boolean;
  href?: string;
};

export type WeeklyAvailabilityWindow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type CoachCalendarSession = {
  scheduled_datetime: string;
  duration_minutes?: number | null;
};

export type SlotNudgeSuggestion = {
  type: CoachCreateSessionType;
  date: string;
  time: string;
  label: string;
  createUrl: string;
};

const DEFAULT_NUDGE_DURATION_MIN = 60;
const DEFAULT_NUDGE_TYPE: CoachCreateSessionType = 'small_group';

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((p) => parseInt(p, 10));
  if (!Number.isFinite(h)) return 0;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function normalizeClockTime(time: string): string {
  const parts = time.trim().split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function sessionIntervalEndMs(scheduledIso: string, durationMinutes: number | null | undefined): number {
  const start = new Date(scheduledIso).getTime();
  if (Number.isNaN(start)) return NaN;
  const dm =
    durationMinutes != null && Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0
      ? Number(durationMinutes)
      : DEFAULT_NUDGE_DURATION_MIN;
  return start + dm * 60_000;
}

function ymdInEasternFromNowPlusDays(now: Date, dayOffset: number): string {
  const d = addDays(now, dayOffset);
  return formatInTimeZone(d, APP_TIMEZONE, 'yyyy-MM-dd');
}

function slotOverlapsExistingSession(
  date: string,
  time: string,
  durationMinutes: number,
  sessions: CoachCalendarSession[]
): boolean {
  const startIso = easternWallDateTimeToUtcIso(date, time);
  const proposedStart = new Date(startIso).getTime();
  const proposedEnd = proposedStart + durationMinutes * 60_000;
  if (Number.isNaN(proposedStart)) return true;

  for (const s of sessions) {
    const bStart = new Date(s.scheduled_datetime).getTime();
    const bEnd = sessionIntervalEndMs(s.scheduled_datetime, s.duration_minutes);
    if (Number.isNaN(bStart) || Number.isNaN(bEnd)) continue;
    if (intervalsOverlapHalfOpen(proposedStart, proposedEnd, bStart, bEnd)) return true;
  }
  return false;
}

/** Evening slots (5–8pm Eastern) rank higher when multiple windows qualify. */
function eveningScore(time: string): number {
  const mins = timeToMinutes(time);
  const hour = Math.floor(mins / 60);
  if (hour >= 17 && hour < 20) return 10;
  if (hour >= 16 && hour < 21) return 5;
  return 0;
}

export function buildCreateSessionPrefillUrl(args: {
  type?: CoachCreateSessionType;
  date: string;
  time: string;
}): string {
  const params = new URLSearchParams();
  if (args.type) params.set('type', args.type);
  params.set('date', args.date);
  params.set('time', args.time);
  return `/coach-sessions/create?${params.toString()}`;
}

export type SuggestOpenSlotsArgs = {
  weeklyWindows: WeeklyAvailabilityWindow[];
  upcomingSessions: CoachCalendarSession[];
  now?: Date;
  horizonDays?: number;
  minDurationMinutes?: number;
  maxSuggestions?: number;
  sessionType?: CoachCreateSessionType;
};

/**
 * Finds open calendar windows (weekly availability minus existing sessions) and suggests
 * small-group session times coaches can one-tap pre-fill on create session.
 */
export function suggestOpenSlots(args: SuggestOpenSlotsArgs): SlotNudgeSuggestion[] {
  const {
    weeklyWindows,
    upcomingSessions,
    now = new Date(),
    horizonDays = 14,
    minDurationMinutes = DEFAULT_NUDGE_DURATION_MIN,
    maxSuggestions = 2,
    sessionType = DEFAULT_NUDGE_TYPE,
  } = args;

  if (weeklyWindows.length === 0) return [];

  const nowMs = now.getTime();
  const candidates: Array<SlotNudgeSuggestion & { sortKey: string; score: number }> = [];

  for (let offset = 0; offset <= horizonDays; offset++) {
    const ymd = ymdInEasternFromNowPlusDays(now, offset);
    const dow = easternSundayZeroDowFromYmd(ymd);

    for (const window of weeklyWindows) {
      if (window.day_of_week !== dow) continue;

      const startMins = timeToMinutes(window.start_time);
      const endMins = timeToMinutes(window.end_time);
      if (endMins - startMins < minDurationMinutes) continue;

      const time = normalizeClockTime(window.start_time);
      const startIso = easternWallDateTimeToUtcIso(ymd, time);
      if (new Date(startIso).getTime() < nowMs) continue;
      if (slotOverlapsExistingSession(ymd, time, minDurationMinutes, upcomingSessions)) continue;

      const label = formatEST(parseISO(`${ymd}T12:00:00`), 'EEE') + ' · ' + formatEST(startIso, 'h:mm a');
      candidates.push({
        type: sessionType,
        date: ymd,
        time,
        label,
        createUrl: buildCreateSessionPrefillUrl({ type: sessionType, date: ymd, time }),
        sortKey: `${ymd}T${time}`,
        score: eveningScore(time) - offset * 0.1,
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.sortKey.localeCompare(b.sortKey);
  });

  const seen = new Set<string>();
  const out: SlotNudgeSuggestion[] = [];
  for (const c of candidates) {
    const key = `${c.date}|${c.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: c.type, date: c.date, time: c.time, label: c.label, createUrl: c.createUrl });
    if (out.length >= maxSuggestions) break;
  }
  return out;
}

export type ComputeActivationStepsInput = {
  profileComplete: boolean;
  hasRateCard: boolean;
  hasCalendar: boolean;
  isBookable: boolean;
  coachId: string;
};

export function computeActivationSteps(input: ComputeActivationStepsInput): CoachActivationStep[] {
  const bookingPath = `/book/${input.coachId}`;

  return [
    {
      id: 'profile',
      label: 'Complete your profile',
      description: 'Add a bio so parents know who you are.',
      done: input.profileComplete,
      href: '/profile',
    },
    {
      id: 'rate_card',
      label: 'Set your rates',
      description: 'Add session types and prices parents will see.',
      done: input.hasRateCard,
      href: '/rate-card',
    },
    {
      id: 'calendar',
      label: 'Open your calendar',
      description: 'Add weekly availability so families can book.',
      done: input.hasCalendar,
      href: '/availability',
    },
    {
      id: 'bookable',
      label: 'Post something to book',
      description: 'Create an open session or keep privates on your calendar.',
      done: input.isBookable,
      href: '/coach-sessions/create',
    },
    {
      id: 'share',
      label: 'Share your booking link',
      description: 'Send your link to families when you are ready.',
      done: false,
      href: bookingPath,
    },
  ];
}

export function isCoreActivationComplete(steps: CoachActivationStep[]): boolean {
  return steps.filter((s) => s.id !== 'share').every((s) => s.done);
}

export function shouldShowSlotNudges(args: {
  hasCalendar: boolean;
  upcomingPublicSessionCount: number;
}): boolean {
  return args.hasCalendar && args.upcomingPublicSessionCount === 0;
}
