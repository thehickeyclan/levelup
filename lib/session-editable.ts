/** Whether a scheduled session can still be edited or rescheduled (before start time). */
export function isSessionEditableBeforeStart(
  session: { status: string; scheduled_datetime: string },
  now: Date = new Date()
): boolean {
  if (session.status !== 'scheduled') return false;
  const start = new Date(session.scheduled_datetime);
  if (Number.isNaN(start.getTime())) return false;
  return start > now;
}

export const SESSION_NOT_EDITABLE_ERROR =
  'This session has already started or was cancelled and can no longer be changed.';
