import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRegisterConfirmationToken } from './confirmation-token';

describe('createRegisterConfirmationToken', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is stable within the same 10-minute window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-12T16:00:00Z'));
    const a = createRegisterConfirmationToken('session-abc');
    vi.setSystemTime(new Date('2026-06-12T16:05:00Z'));
    const b = createRegisterConfirmationToken('session-abc');
    expect(a).toBe(b);
  });

  it('changes across 10-minute windows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-12T16:09:00Z'));
    const a = createRegisterConfirmationToken('session-abc');
    vi.setSystemTime(new Date('2026-06-12T16:11:00Z'));
    const b = createRegisterConfirmationToken('session-abc');
    expect(a).not.toBe(b);
  });
});
