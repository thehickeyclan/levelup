import { describe, expect, it } from 'vitest';
import { timeOfDayGreeting } from '@/lib/time-greeting';
import { fromZonedTime } from 'date-fns-tz';
import { APP_TIMEZONE } from '@/lib/format-date';

function easternLocal(isoLocal: string): Date {
  return fromZonedTime(isoLocal, APP_TIMEZONE);
}

describe('timeOfDayGreeting', () => {
  it('returns Good morning before noon Eastern', () => {
    expect(timeOfDayGreeting(easternLocal('2026-06-14T09:30:00'))).toBe('Good morning');
  });

  it('returns Good afternoon midday Eastern', () => {
    expect(timeOfDayGreeting(easternLocal('2026-06-14T14:00:00'))).toBe('Good afternoon');
  });

  it('returns Good evening after 5pm Eastern', () => {
    expect(timeOfDayGreeting(easternLocal('2026-06-14T19:00:00'))).toBe('Good evening');
  });
});
