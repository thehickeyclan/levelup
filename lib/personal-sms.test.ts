import { describe, expect, it } from 'vitest';
import {
  buildPersonalGroupSmsHref,
  phonesFromPasteList,
  uniqueTenDigitPhones,
} from '@/lib/personal-sms';

describe('uniqueTenDigitPhones', () => {
  it('dedupes and normalizes US numbers', () => {
    expect(uniqueTenDigitPhones(['9195551234', '+19195551234', '919-555-1234'])).toEqual(['9195551234']);
  });

  it('keeps distinct numbers in order', () => {
    expect(uniqueTenDigitPhones(['9195551234', '9195555678'])).toEqual(['9195551234', '9195555678']);
  });
});

describe('phonesFromPasteList', () => {
  it('parses CRLF lists', () => {
    expect(phonesFromPasteList('9195551234\r\n9195555678')).toEqual(['9195551234', '9195555678']);
  });

  it('parses comma lists', () => {
    expect(phonesFromPasteList('9195551234, 9195555678')).toEqual(['9195551234', '9195555678']);
  });
});

describe('buildPersonalGroupSmsHref', () => {
  it('builds single-recipient link', () => {
    expect(buildPersonalGroupSmsHref(['9195551234'], 'Hi')).toBe('sms:9195551234?body=Hi');
  });

  it('builds comma-separated multi-recipient link', () => {
    expect(buildPersonalGroupSmsHref(['9195551234', '9195555678'], 'Hi there')).toBe(
      'sms:9195551234,9195555678?body=Hi%20there'
    );
  });
});
