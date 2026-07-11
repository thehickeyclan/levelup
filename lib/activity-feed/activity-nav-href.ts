/** Desktop nav default for /activity — matches home widgets per role. */
export function activityNavHref(
  role: 'coach' | 'parent' | 'youth_wrestler' | string | null | undefined
): string {
  if (role === 'coach') return '/activity?scope=coach';
  if (role === 'parent') return '/activity?scope=family';
  return '/activity';
}
