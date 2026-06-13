'use client';

import Link from 'next/link';
import { timeOfDayGreeting, formatCalendarLastUpdated } from '@/lib/time-greeting';

type Props = {
  coachFirstName?: string | null;
  calendarLastUpdatedAt?: string | null;
};

export function CoachScheduleWelcomeBanner({ coachFirstName, calendarLastUpdatedAt }: Props) {
  const greeting = timeOfDayGreeting();
  const name = coachFirstName?.trim();
  const calendarLine = calendarLastUpdatedAt
    ? formatCalendarLastUpdated(calendarLastUpdatedAt)
    : null;

  return (
    <section aria-label="Welcome" className="rounded-xl border border-accent/25 bg-card px-4 py-3.5">
      <p className="text-lg font-semibold text-foreground leading-snug">
        {greeting}
        {name ? (
          <>
            {', '}
            <span className="text-accent">{name}</span>
          </>
        ) : null}
      </p>

      <p className="mt-1.5 text-sm text-muted-foreground leading-snug">
        {calendarLine ? (
          <>
            Calendar updated {calendarLine}.{' '}
            <Link href="/availability" className="text-accent font-medium hover:underline">
              Update calendar
            </Link>{' '}
            so parents see when you&apos;re available.
          </>
        ) : (
          <>
            Parents book from your open times —{' '}
            <Link href="/availability" className="text-accent font-medium hover:underline">
              update calendar
            </Link>{' '}
            so they know your schedule.
          </>
        )}
      </p>
    </section>
  );
}
