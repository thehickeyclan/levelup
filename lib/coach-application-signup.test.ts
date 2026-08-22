import { describe, expect, it } from 'vitest';
import {
  buildCoachApplicationAthleteInsert,
  buildCoachApplicationUserInsert,
  COACH_APPLICATION_ATHLETE_INSERT_KEYS,
  COACH_APPLICATION_USERS_INSERT_KEYS,
} from './coach-application-signup';

function sortedKeys(obj: object): string[] {
  return Object.keys(obj).sort();
}

describe('coach application signup DB payloads', () => {
  it('users insert uses exactly the columns declared (prevents schema drift vs migrations)', () => {
    const row = buildCoachApplicationUserInsert({
      userId: '00000000-0000-4000-8000-000000000001',
      emailNormalized: 'coach@example.com',
      firstName: 'Nick',
      lastName: "O'Neill",
      phoneDigits: '9195551212',
    });
    expect(sortedKeys(row)).toEqual([...COACH_APPLICATION_USERS_INSERT_KEYS].sort());
  });

  it('athletes insert uses exactly the columns declared', () => {
    const row = buildCoachApplicationAthleteInsert({
      userId: '00000000-0000-4000-8000-000000000001',
      firstName: 'Nick',
      lastName: 'Test',
      school: 'UNC',
      coachType: 'ncaa_athlete',
      weightClass: '157',
      bio: 'Test bio',
      dateOfBirth: '2000-01-15',
      payoutMethod: 'venmo',
      venmoHandle: '@nick',
      zelleContact: null,
      hasSafeSport: true,
      safeSportExpiry: '2026-12-01',
      hasUsaWrestling: true,
      usaWrestlingExpiry: '2026-12-01',
      hasBackgroundCheck: false,
      backgroundCheckDate: null,
      tshirtSize: 'M',
    });
    expect(sortedKeys(row)).toEqual([...COACH_APPLICATION_ATHLETE_INSERT_KEYS].sort());
  });
});
