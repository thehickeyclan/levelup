/**
 * Helpers for coach availability (athlete_availability) and slot expansion.
 * Slots are 1-hour increments; times in 24h "HH:mm" format.
 */

/** Fired after coach blocked dates are added/removed so the availability calendar can refresh day markers. */
export const COACH_AVAILABILITY_BLOCKS_CHANGED_EVENT = 'coach-availability-blocks-changed';

export interface AvailabilitySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

/** Parse DB TIME "HH:MM:SS" or "HH:MM" to "HH:mm" */
export function timeToHHmm(t: string | null | undefined): string {
  if (!t || typeof t !== 'string') return '00:00';
  const part = t.split(':').slice(0, 2).join(':');
  return part.length >= 5 ? part : `${part.padStart(2, '0')}:00`;
}

/** Expand [start, end) into 1-hour slots. E.g. "08:00"–"10:00" → ["08:00", "09:00"] */
export function expandToSlots(start: string, end: string): string[] {
  const [sh, sm] = start.split(':').map((x) => parseInt(x, 10) || 0);
  const [eh, em] = end.split(':').map((x) => parseInt(x, 10) || 0);
  let startM = sh * 60 + sm;
  let endM = eh * 60 + em;
  if (endM <= startM) return [];
  const out: string[] = [];
  for (let m = startM; m < endM; m += 60) {
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    out.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  return out;
}

/** 24h "HH:mm" to display "h:mm AM/PM" */
export function formatSlotDisplay(s: string): string {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10) || 0);
  const h12 = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Display "8:00 AM" etc. to 24h "HH:mm" */
export function displayTo24h(s: string): string {
  const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '09:00';
  let h = parseInt(match[1], 10);
  const mm = match[2];
  const pm = (match[3] || '').toUpperCase() === 'PM';
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${mm}`;
}

/** Normalize client/API scheduled time (24h HH:mm[:ss], or display "h:mm AM/PM") to "HH:mm". */
export function normalizeRequestSlotHHmm(raw: string): string {
  const t = (raw ?? '').trim();
  if (!t) return '00:00';
  if (/\b(AM|PM)\b/i.test(t)) {
    return displayTo24h(t);
  }
  return timeToHHmm(t);
}

/** Get day_of_week (0–6) for a Date. Sunday = 0. */
export function getDayOfWeek(d: Date): number {
  return d.getDay();
}

/** Get all 1-hour slots for a day from availability rows */
export function slotsForDay(
  availability: AvailabilitySlot[],
  dayOfWeek: number
): string[] {
  const dayRows = availability.filter((a) => a.day_of_week === dayOfWeek);
  const set = new Set<string>();
  for (const row of dayRows) {
    const start = timeToHHmm(row.start_time);
    const end = timeToHHmm(row.end_time);
    for (const slot of expandToSlots(start, end)) set.add(slot);
  }
  return [...set].sort();
}

/** Date-specific slot row */
export interface AvailabilitySlotDate {
  slot_date: string;
  start_time: string;
  end_time: string;
}

/** Get all 1-hour slots for a date from date-specific rows */
export function slotsForDate(rows: AvailabilitySlotDate[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const start = timeToHHmm(row.start_time);
    const end = timeToHHmm(row.end_time);
    for (const slot of expandToSlots(start, end)) set.add(slot);
  }
  return [...set].sort();
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type WeeklyAvailabilityRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

/** Human-readable lines for public coach profile (Eastern labels). */
export function summarizeWeeklyAvailability(rows: WeeklyAvailabilityRow[]): string[] {
  if (!rows?.length) return [];
  type Window = { start: string; end: string };
  const byDay = new Map<number, Window[]>();
  for (const r of rows) {
    const d = r.day_of_week;
    if (d < 0 || d > 6) continue;
    const start = timeToHHmm(r.start_time);
    const end = timeToHHmm(r.end_time);
    const list = byDay.get(d) ?? [];
    list.push({ start, end });
    byDay.set(d, list);
  }
  const lines: string[] = [];
  for (let d = 0; d <= 6; d++) {
    const windows = byDay.get(d);
    if (!windows?.length) continue;
    windows.sort((a, b) => a.start.localeCompare(b.start));
    const label = DOW_SHORT[d];
    const parts = windows.map((w) => `${formatSlotDisplay(w.start)} – ${formatSlotDisplay(w.end)}`);
    lines.push(`${label} · ${parts.join(', ')}`);
  }
  return lines;
}
