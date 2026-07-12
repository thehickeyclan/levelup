/** Default /activity link per role (community feed unless coach-specific). */
export function activityNavHref(
  role: 'coach' | 'parent' | 'youth_wrestler' | 'admin' | string | null | undefined
): string {
  if (role === 'coach') return '/activity?scope=coach';
  return '/activity';
}
