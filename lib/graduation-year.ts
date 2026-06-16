/** Class-of years shown in wrestler add/edit selects (current year −2 through +13). */
export function graduationYearOptions(baseYear = new Date().getFullYear()): number[] {
  return Array.from({ length: 16 }, (_, i) => baseYear - 2 + i);
}

export function parseGraduationYear(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return null;
  const min = new Date().getFullYear() - 2;
  const max = new Date().getFullYear() + 13;
  if (n < min || n > max) return null;
  return n;
}

export const GRADUATION_YEAR_REQUIRED_MESSAGE = 'Graduation year is required (Class of …).';
