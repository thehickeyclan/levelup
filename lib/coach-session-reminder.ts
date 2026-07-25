import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';

export const COACH_REMINDER_WINDOW_MIN_MINUTES = 55;
export const COACH_REMINDER_WINDOW_MAX_MINUTES = 65;

export function isInCoachOneHourReminderWindow(
  scheduledDatetime: string,
  nowMs = Date.now()
): boolean {
  const scheduledMs = new Date(scheduledDatetime).getTime();
  if (!Number.isFinite(scheduledMs)) return false;
  const minutesUntil = (scheduledMs - nowMs) / 60_000;
  return (
    minutesUntil >= COACH_REMINDER_WINDOW_MIN_MINUTES &&
    minutesUntil <= COACH_REMINDER_WINDOW_MAX_MINUTES
  );
}

export function buildCoachOneHourReminderBody(input: {
  scheduledDatetime: string;
  sessionType?: string | null;
  sessionMode?: string | null;
  facilityName?: string | null;
  sessionUrl: string;
}): string {
  const typeLabel = getSessionTypeDisplay(input.sessionType, input.sessionMode).label;
  const when = formatEST(new Date(input.scheduledDatetime), 'h:mm a');
  const location = input.facilityName?.trim()
    ? ` at ${input.facilityName.trim()}`
    : '';
  return `Guild reminder: Your ${typeLabel} session starts in about 1 hour at ${when}${location}. View session: ${input.sessionUrl}`;
}
