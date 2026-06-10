/** Whether session details can be edited (any scheduled session, including past start time). */
export function isScheduledSessionEditable(status: string): boolean {
  return (status ?? '').toLowerCase() === 'scheduled';
}

/** Whether a scheduled session can still be rescheduled (before start time). */
export function isSessionEditableBeforeStart(
  session: { status: string; scheduled_datetime: string },
  now: Date = new Date()
): boolean {
  if (!isScheduledSessionEditable(session.status)) return false;
  const start = new Date(session.scheduled_datetime);
  if (Number.isNaN(start.getTime())) return false;
  return start > now;
}

export const SESSION_NOT_EDITABLE_ERROR =
  'Only scheduled sessions can be edited. Completed or cancelled sessions cannot be changed.';

export const SESSION_NOT_RESCHEDULABLE_ERROR =
  'This session has already started or was cancelled and can no longer be rescheduled.';
