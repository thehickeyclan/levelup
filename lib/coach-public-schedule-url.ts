/** Public page listing all of a coach's upcoming sessions — single share destination. */
export function coachPublicSchedulePath(coachId: string): string {
  return `/coach/${coachId}`;
}

export function coachPublicScheduleUrl(origin: string, coachId: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}${coachPublicSchedulePath(coachId)}`;
}
