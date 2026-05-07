import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilitySlot } from '@/lib/availability';
import {
  mergeSlotsWithFacilities,
  type SlotWithFacility,
} from '@/lib/availability-slots-with-facility';

/**
 * Resolved calendar day (date-only string) hourly slots merged from dated rows + weekly recurrence.
 */
export async function fetchCoachDaySlotsMerged(
  db: SupabaseClient,
  coachId: string,
  dateOnly: string
): Promise<SlotWithFacility[]> {
  const { data: dateRows } = await db
    .from('athlete_availability_slots')
    .select('slot_date, start_time, end_time, facility_id')
    .eq('athlete_id', coachId)
    .eq('slot_date', dateOnly);

  const { data: weeklyRows } = await db
    .from('athlete_availability')
    .select('day_of_week, start_time, end_time')
    .eq('athlete_id', coachId);

  const d = new Date(`${dateOnly}T12:00:00`);
  const dayOfWeek = Number.isNaN(d.getTime()) ? 0 : d.getDay();

  return mergeSlotsWithFacilities(
    (dateRows ?? []) as Parameters<typeof mergeSlotsWithFacilities>[0],
    (weeklyRows ?? []) as AvailabilitySlot[],
    dateOnly,
    dayOfWeek
  );
}
