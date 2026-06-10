import { describe, it, expect } from 'vitest';
import { isSessionEditableBeforeStart } from './session-editable';

describe('isSessionEditableBeforeStart', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  it('allows scheduled future sessions', () => {
    expect(isSessionEditableBeforeStart({ status: 'scheduled', scheduled_datetime: future })).toBe(true);
  });

  it('blocks started sessions', () => {
    expect(isSessionEditableBeforeStart({ status: 'scheduled', scheduled_datetime: past })).toBe(false);
  });

  it('blocks non-scheduled statuses', () => {
    expect(isSessionEditableBeforeStart({ status: 'completed', scheduled_datetime: future })).toBe(false);
    expect(isSessionEditableBeforeStart({ status: 'cancelled', scheduled_datetime: future })).toBe(false);
  });
});
