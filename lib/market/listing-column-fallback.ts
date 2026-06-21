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

export const PURCHASE_PRIVATE_LISTING_COLUMNS = [
  'purchase_source',
  'purchase_price_cents',
  'purchased_at',
] as const;

export function hasPurchasePrivateListingFields(row: Record<string, unknown>): boolean {
  return PURCHASE_PRIVATE_LISTING_COLUMNS.some((col) => col in row);
}

export function isMissingPurchasePrivateListingColumnError(message: string): boolean {
  return PURCHASE_PRIVATE_LISTING_COLUMNS.some((col) => isMissingColumnError(message, col));
}

export function withoutPurchasePrivateListingFields<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row };
  for (const col of PURCHASE_PRIVATE_LISTING_COLUMNS) {
    delete copy[col];
  }
  return copy;
}
