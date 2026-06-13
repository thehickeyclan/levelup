'use client';

import Link from 'next/link';
import { CalendarClock, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCalendarLastUpdated, timeOfDayGreeting } from '@/lib/time-greeting';

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
    <section
      aria-label="Welcome"
      className="rounded-2xl border border-[#D4AF37]/35 bg-gradient-to-br from-[#D4AF37]/12 via-card to-card px-4 py-4 sm:px-5 sm:py-5 shadow-sm"
    >
      <p className="text-lg sm:text-xl font-semibold text-foreground leading-snug">
        {greeting}
        {name ? (
          <>
            {', '}
            <span className="text-[#D4AF37]">{name}</span>
          </>
        ) : null}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <CalendarClock className="h-4 w-4 text-[#D4AF37] shrink-0" aria-hidden />
        {calendarLine ? (
          <span className="text-muted-foreground">
            Calendar updated{' '}
            <span className="text-foreground/90">{calendarLine}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Set your availability so parents can book</span>
        )}
        <Link
          href="/availability"
          className="text-[#D4AF37] font-semibold hover:underline touch-manipulation min-h-[44px] inline-flex items-center"
        >
          {calendarLine ? 'Update calendar' : 'Set up calendar'}
        </Link>
      </div>

      <Button
        asChild
        className="mt-4 w-full min-h-[48px] touch-manipulation bg-[#D4AF37] hover:bg-[#c9a432] text-black font-semibold text-base"
      >
        <Link href="/coach-sessions/create">
          <CalendarPlus className="h-5 w-5 mr-2 shrink-0" />
          Schedule new session
        </Link>
      </Button>
    </section>
  );
}
