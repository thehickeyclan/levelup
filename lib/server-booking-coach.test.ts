import { describe, expect, it } from 'vitest';
import { coachIsBookable } from './server-booking-coach';

describe('coachIsBookable (access-first lane)', () => {
  it('new coaches awaiting review are bookable by direct link', () => {
    expect(coachIsBookable({ status: 'pending' })).toBe(true);
  });

  it('approved and legacy coaches are bookable', () => {
    expect(coachIsBookable({ status: 'active' })).toBe(true);
    expect(coachIsBookable({ status: null })).toBe(true);
    expect(coachIsBookable({})).toBe(true);
  });

  it('rejected and suspended coaches are never bookable', () => {
    expect(coachIsBookable({ status: 'rejected' })).toBe(false);
    expect(coachIsBookable({ status: 'suspended' })).toBe(false);
  });

  it('a missing coach is not bookable', () => {
    expect(coachIsBookable(null)).toBe(false);
    expect(coachIsBookable(undefined)).toBe(false);
  });
});
