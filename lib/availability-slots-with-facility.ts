import { expandToSlots, slotsForDay, timeToHHmm, type AvailabilitySlot, type AvailabilitySlotDate } from '@/lib/availability';

export type SlotWithFacility = { time: string; facilityId: string | null };

type DatedRow = AvailabilitySlotDate & { facility_id?: string | null };

/**
 * Same calendar day as `dateParam` (yyyy-MM-dd): merge date-specific rows with recurring weekly windows.
 * Dated rows win for facility + hour; recurring-only hours have facilityId null (any linked site).
 */
export function mergeSlotsWithFacilities(
  dateRows: DatedRow[],
  weeklyRows: AvailabilitySlot[],
  dateOnly: string,
  dayOfWeek: number
): SlotWithFacility[] {
  const dateMap = new Map<string, string | null>();

  for (const row of dateRows) {
    const start = timeToHHmm(row.start_time);
    const end = timeToHHmm(row.end_time);
    const fid = row.facility_id != null && String(row.facility_id).trim() !== '' ? String(row.facility_id) : null;
    for (const h of expandToSlots(start, end)) {
      const prev = dateMap.get(h);
      if (prev !== undefined && prev !== fid && prev !== null && fid !== null && prev !== fid) {
        // Overlapping dated windows disagree — last row wins.
      }
      dateMap.set(h, fid);
    }
  }

  const recurSlots = slotsForDay(weeklyRows, dayOfWeek);
  const allHours = new Set<string>([...dateMap.keys(), ...recurSlots]);

  const out: SlotWithFacility[] = [];
  for (const time of [...allHours].sort()) {
    if (dateMap.has(time)) {
      out.push({ time, facilityId: dateMap.get(time) ?? null });
    } else {
      out.push({ time, facilityId: null });
    }
  }
  return out;
}
