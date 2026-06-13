import { formatEST } from '@/lib/format-date';

export type TimeOfDayGreeting = 'Good morning' | 'Good afternoon' | 'Good evening';

/** Eastern wall-clock greeting (matches app timezone). */
export function timeOfDayGreeting(at: Date = new Date()): TimeOfDayGreeting {
  const hour = parseInt(formatEST(at, 'H'), 10);
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatCalendarLastUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatEST(d, 'MMM d, yyyy')} at ${formatEST(d, 'h:mm a')}`;
}
