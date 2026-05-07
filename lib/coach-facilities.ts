import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUuidParam } from '@/lib/normalize-uuid-param';

/**
 * Facility ids a coach may use (coach_facilities junction, or primary + secondary on athletes).
 */
export async function getCoachFacilityIds(
  admin: SupabaseClient,
  coachId: string
): Promise<string[]> {
  const { data: cfRows } = await admin
    .from('coach_facilities')
    .select('facility_id')
    .eq('coach_id', coachId);
  const fromJunction = [...new Set((cfRows ?? []).map((r: { facility_id: string }) => r.facility_id).filter(Boolean))];

  if (fromJunction.length > 0) return fromJunction;

  const { data: athlete } = await admin
    .from('athletes')
    .select('facility_id, secondary_facility_id')
    .eq('id', coachId)
    .maybeSingle();
  const a = athlete as { facility_id?: string | null; secondary_facility_id?: string | null } | null;
  const out: string[] = [];
  if (a?.facility_id) out.push(a.facility_id);
  if (a?.secondary_facility_id) out.push(a.secondary_facility_id);
  return [...new Set(out)];
}

export async function coachHasFacility(
  admin: SupabaseClient,
  coachId: string,
  facilityId: string
): Promise<boolean> {
  const set = new Set(await getCoachFacilityIds(admin, coachId));
  return set.has(facilityId);
}

export function normalizeFacilityIdParam(raw: unknown): string | null {
  return normalizeUuidParam(raw);
}
