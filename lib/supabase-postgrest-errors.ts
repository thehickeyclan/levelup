/**
 * PostgREST / Supabase JS: table or column exists in Postgres but API schema is stale,
 * or the column was never added (prod migration not run).
 *
 * Message shape varies by PostgREST version (schema cache vs column/relation wording); merge `details` / `hint`.
 */
function combinedSupabaseErrorText(
  error: { message?: string; details?: string; hint?: string } | null
): string {
  if (!error) return '';
  return [error.message, error.details, error.hint]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' | ');
}

function facilityIdColumnMissingLikely(combinedLower: string, code: string): boolean {
  return (
    combinedLower.includes('schema cache') ||
    combinedLower.includes('could not find') ||
    (combinedLower.includes('not found') && combinedLower.includes('column')) ||
    (combinedLower.includes('column') &&
      (combinedLower.includes('does not exist') ||
        combinedLower.includes('unknown') ||
        combinedLower.includes('undefined'))) ||
    code === 'PGRST204' ||
    code === '42703'
  );
}

export type AvailabilitySlotsFacilityErrorOpts = {
  /** True when the failing query was `.from('athlete_availability_slots').select('facility_id', ...)` */
  fromSlotsProbe?: boolean;
};

export function isAthleteAvailabilitySlotsFacilityIdSchemaError(
  error: { message?: string; code?: string; details?: string; hint?: string } | null,
  opts?: AvailabilitySlotsFacilityErrorOpts
): boolean {
  if (!error) return false;
  const c = combinedSupabaseErrorText(error).toLowerCase();
  if (!c.includes('facility_id')) return false;

  const code = String(error.code ?? '');
  if (!facilityIdColumnMissingLikely(c, code)) return false;

  if (opts?.fromSlotsProbe) return true;

  return (
    c.includes('athlete_availability_slots') ||
    c.includes('"athlete_availability_slots"') ||
    c.includes("'athlete_availability_slots'")
  );
}
