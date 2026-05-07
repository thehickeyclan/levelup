/**
 * Shared validation for US-style cell numbers stored as arbitrary strings (digits + formatting).
 */

/** True if value has at least `minDigits` numeric digits (default 10). */
export function hasMinPhoneDigits(value: string | null | undefined, minDigits = 10): boolean {
  if (value == null || typeof value !== 'string') return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= minDigits;
}

/** Alias: same rules as `validateRequiredYouthPhone` — use for parent/coach signup copy. */
export function validateRequiredCellPhone(raw: unknown) {
  return validateRequiredYouthPhone(raw);
}

/** Required athlete/parent-supplied cell for youth wrestler create/update. */
export function validateRequiredYouthPhone(raw: unknown):
  | { ok: true; phone: string }
  | { ok: false; message: string } {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: false, message: 'Cell phone is required' };
  }
  const s = String(raw).trim();
  if (!hasMinPhoneDigits(s)) {
    return { ok: false, message: 'Enter a valid cell number (at least 10 digits)' };
  }
  return { ok: true, phone: s };
}

/**
 * Format E.164 for pasting into iOS/Android Messages **To** field (group text).
 * US/Canada (+1 + 10 digits): outputs **10 digits only** (no +1, no punctuation) — most reliable for one-tap paste.
 * Other countries: keeps full E.164 (e.g. +44…).
 */
export function formatPhoneForSmsPaste(e164: string): string {
  const s = e164.trim();
  if (/^\+1\d{10}$/.test(s)) return s.slice(2);
  return s;
}
