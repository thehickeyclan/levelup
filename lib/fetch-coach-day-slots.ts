import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilitySlot } from '@/lib/availability';
import {
  mergeSlotsWithFacilities,
  type SlotWithFacility,
} from '@/lib/availability-slots-with-facility';
import { isAthleteAvailabilitySlotsFacilityIdSchemaError } from '@/lib/supabase-postgrest-errors';

/**
 * Resolved calendar day (date-only string) hourly slots merged from dated rows + weekly recurrence.
 */
export async function fetchCoachDaySlotsMerged(
  db: SupabaseClient,
  coachId: string,
  dateOnly: string
): Promise<SlotWithFacility[]> {
  type DatedRow =
    Parameters<typeof mergeSlotsWithFacilities>[0][number];

  const dated1 = await db
    .from('athlete_availability_slots')
    .select('slot_date, start_time, end_time, facility_id')
    .eq('athlete_id', coachId)
    .eq('slot_date', dateOnly);

  let dateRows: DatedRow[];
  if (dated1.error && isAthleteAvailabilitySlotsFacilityIdSchemaError(dated1.error)) {
    const dated2 = await db
      .from('athlete_availability_slots')
      .select('slot_date, start_time, end_time')
      .eq('athlete_id', coachId)
      .eq('slot_date', dateOnly);
    dateRows = (dated2.data ?? []) as DatedRow[];
  } else {
    dateRows = (dated1.data ?? []) as DatedRow[];
    if (dated1.error && process.env.NODE_ENV === 'development') {
      console.error('[fetchCoachDaySlotsMerged] athlete_availability_slots:', dated1.error);
    }
  }

  const { data: weeklyRows } = await db
    .from('athlete_availability')
    .select('day_of_week, start_time, end_time')
    .eq('athlete_id', coachId);

  const d = new Date(`${dateOnly}T12:00:00`);
  const dayOfWeek = Number.isNaN(d.getTime()) ? 0 : d.getDay();

  return mergeSlotsWithFacilities(
    dateRows ?? [],
    (weeklyRows ?? []) as AvailabilitySlot[],
    dateOnly,
    dayOfWeek
  );
}
