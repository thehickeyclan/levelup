import { describe, expect, it } from 'vitest';
import { coachIsBookable } from './server-booking-coach';

describe('coachIsBookable (access-first lane, fail-closed)', () => {
  it('new coaches awaiting review are bookable by direct link even while unlisted', () => {
    expect(coachIsBookable({ status: 'pending', active: false })).toBe(true);
    expect(coachIsBookable({ status: 'pending' })).toBe(true);
  });

  it('approved and legacy coaches are bookable only while directory-active', () => {
    expect(coachIsBookable({ status: 'active', active: true })).toBe(true);
    expect(coachIsBookable({ status: null, active: true })).toBe(true);
  });

  it('a deleted or deactivated coach (active=false, status untouched) is not bookable', () => {
    // The account anonymizer sets active:false; legacy admin deactivation did the same.
    expect(coachIsBookable({ status: 'active', active: false })).toBe(false);
    expect(coachIsBookable({ status: null, active: false })).toBe(false);
    expect(coachIsBookable({ status: 'active' })).toBe(false);
  });

  it('rejected and suspended coaches are never bookable', () => {
    expect(coachIsBookable({ status: 'rejected', active: true })).toBe(false);
    expect(coachIsBookable({ status: 'suspended', active: true })).toBe(false);
  });

  it('unknown or misspelled statuses fail closed', () => {
    expect(coachIsBookable({ status: 'rejcted', active: true })).toBe(false);
    expect(coachIsBookable({ status: 'banned', active: true })).toBe(false);
  });

  it('a missing coach is not bookable', () => {
    expect(coachIsBookable(null)).toBe(false);
    expect(coachIsBookable(undefined)).toBe(false);
  });
});
