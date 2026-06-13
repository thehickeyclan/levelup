import { describe, expect, it, vi } from 'vitest';
import {
  buildMessagesPasteList,
  buildSingleSmsHref,
  buildComposeOnlySmsHref,
  phonesFromPasteList,
  planPersonalGroupSms,
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

describe('buildMessagesPasteList', () => {
  it('joins with CRLF on non-iOS', () => {
    expect(buildMessagesPasteList(['9195551234', '7046903257'], { ios: false })).toBe(
      '9195551234\r\n7046903257'
    );
  });

  it('joins with commas on iOS', () => {
    expect(buildMessagesPasteList(['9195551234', '7046903257'], { ios: true })).toBe(
      '9195551234,7046903257'
    );
  });
});

describe('buildComposeOnlySmsHref', () => {
  it('uses sms:?body= for compose-only', () => {
    expect(buildComposeOnlySmsHref('Hi there')).toBe('sms:?body=Hi%20there');
  });
});

describe('planPersonalGroupSms', () => {
  it('uses direct link for one number', () => {
    const plan = planPersonalGroupSms({ pasteList: '9195551234', body: 'Hi' });
    expect(plan).toEqual({ mode: 'single', href: 'sms:9195551234?body=Hi', count: 1 });
  });

  it('uses paste mode for multiple numbers (iOS cannot sms:a,b,c)', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone' });
    const plan = planPersonalGroupSms({ pasteList: '9195551234\r\n7046903257', body: 'Hi there' });
    vi.unstubAllGlobals();
    expect(plan?.mode).toBe('paste');
    if (plan?.mode === 'paste') {
      expect(plan.count).toBe(2);
      expect(plan.pasteList).toBe('9195551234,7046903257');
      expect(plan.href).toBe('sms:?body=Hi%20there');
    }
  });
});

describe('buildSingleSmsHref', () => {
  it('builds single-recipient link', () => {
    expect(buildSingleSmsHref('9195551234', 'Hi')).toBe('sms:9195551234?body=Hi');
  });
});
