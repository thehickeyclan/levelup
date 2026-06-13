import { describe, expect, it } from 'vitest';
import { uniqueTenDigitPhones } from '@/lib/personal-sms';

describe('uniqueTenDigitPhones', () => {
  it('dedupes and normalizes US numbers', () => {
    expect(uniqueTenDigitPhones(['9195551234', '+19195551234', '919-555-1234'])).toEqual(['9195551234']);
  });

  it('keeps distinct numbers in order', () => {
    expect(uniqueTenDigitPhones(['9195551234', '9195555678'])).toEqual(['9195551234', '9195555678']);
  });
});
