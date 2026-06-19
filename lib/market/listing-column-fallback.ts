/** True when PostgREST reports a column missing from schema cache (migration not applied). */
export function isMissingColumnError(message: string, column: string): boolean {
  const m = message.toLowerCase();
  const col = column.toLowerCase();
  return (
    m.includes(col) &&
    (m.includes('schema cache') || m.includes('could not find') || m.includes('does not exist'))
  );
}

export function withoutColorFamily<T extends Record<string, unknown>>(row: T): Omit<T, 'color_family'> {
  const { color_family: _omit, ...rest } = row;
  return rest;
}

export function withoutColumn<T extends Record<string, unknown>, K extends keyof T>(
  row: T,
  column: K
): Omit<T, K> {
  const copy = { ...row };
  delete copy[column];
  return copy;
}
