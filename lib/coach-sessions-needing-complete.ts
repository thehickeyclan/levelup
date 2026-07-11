import type { CoachSession } from '@/app/(athlete)/athlete-dashboard/coach-schedule-card';

/** Scheduled sessions whose start time has passed — coach should mark complete. */
export function sessionsNeedingCoachComplete(
  sessions: CoachSession[],
  now: Date = new Date()
): CoachSession[] {
  const nowMs = now.getTime();
  return sessions
    .filter((s) => {
      if (s.status !== 'scheduled') return false;
      const t = new Date(s.scheduled_datetime).getTime();
      return !Number.isNaN(t) && t < nowMs;
    })
    .sort(
      (a, b) =>
        new Date(b.scheduled_datetime).getTime() - new Date(a.scheduled_datetime).getTime()
    );
}
