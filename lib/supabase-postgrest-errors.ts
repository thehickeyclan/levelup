/**
 * PostgREST / Supabase JS: table or column exists in Postgres but API schema is stale,
 * or the column was never added (prod migration not run).
 */
export function isAthleteAvailabilitySlotsFacilityIdSchemaError(
  error: { message?: string; code?: string } | null
): boolean {
  if (!error) return false;
  const m = (error.message ?? '').toLowerCase();
  if (m.includes("could not find the 'facility_id' column")) return true;
  if (m.includes('facility_id') && m.includes('athlete_availability_slots') && m.includes('schema cache')) return true;
  if (error.code === 'PGRST204' && m.includes('facility_id') && m.includes('athlete_availability_slots'))
    return true;
  return false;
}
