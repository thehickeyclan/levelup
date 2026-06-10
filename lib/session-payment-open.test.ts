import { describe, it, expect } from 'vitest';
import {
  isSessionOpenForRegistrationPayment,
  isPastSessionDatetime,
  registrationPaymentBlockedMessage,
} from './session-payment-open';

describe('isSessionOpenForRegistrationPayment', () => {
  it('allows scheduled and completed', () => {
    expect(isSessionOpenForRegistrationPayment('scheduled')).toBe(true);
    expect(isSessionOpenForRegistrationPayment('completed')).toBe(true);
  });

  it('blocks cancelled and no-show', () => {
    expect(isSessionOpenForRegistrationPayment('cancelled')).toBe(false);
    expect(isSessionOpenForRegistrationPayment('no-show')).toBe(false);
  });
});

describe('isPastSessionDatetime', () => {
  it('detects past times', () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect(isPastSessionDatetime(past)).toBe(true);
  });
});

describe('registrationPaymentBlockedMessage', () => {
  it('does not tell completed sessions to contact support', () => {
    expect(registrationPaymentBlockedMessage('completed')).not.toMatch(/contact support/i);
  });
});
