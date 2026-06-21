/** Extract a single model year from era strings or catalog years_produced. */
export function parseModelYearHint(
  era?: string | null,
  yearsProduced?: string | null
): number | null {
  const text = [era, yearsProduced].filter(Boolean).join(' ');
  const matches = text.match(/\b(19|20)\d{2}\b/g);
  if (!matches?.length) return null;
  const years = matches.map((y) => Number(y)).filter((y) => y >= 1990 && y <= 2035);
  if (!years.length) return null;
  return Math.max(...years);
}
