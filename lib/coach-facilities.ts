import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUuidParam } from '@/lib/normalize-uuid-param';

/**
 * Coach ↔ facility model
 * - `athletes.facility_id` / `secondary_facility_id`: home bases (defaults, map pin, profile).
 * - `coach_facilities`: sites this coach has used (auto-linked); drives Training discovery filters.
 * - Sessions, availability, booking: any row in global `facilities` (admin-approved list).
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

  const { data: athlete } = await admin
    .from('athletes')
    .select('facility_id, secondary_facility_id')
    .eq('id', coachId)
    .maybeSingle();
  const a = athlete as { facility_id?: string | null; secondary_facility_id?: string | null } | null;

  const merged: string[] = [...fromJunction];
  if (a?.facility_id) merged.push(a.facility_id);
  if (a?.secondary_facility_id) merged.push(a.secondary_facility_id);

  const { data: sessionRows } = await admin
    .from('sessions')
    .select('facility_id')
    .eq('athlete_id', coachId)
    .not('facility_id', 'is', null);
  for (const row of sessionRows ?? []) {
    const fid = (row as { facility_id?: string | null }).facility_id;
    if (fid) merged.push(fid);
  }

  const { data: slotRows } = await admin
    .from('athlete_availability_slots')
    .select('facility_id')
    .eq('athlete_id', coachId)
    .not('facility_id', 'is', null);
  for (const row of slotRows ?? []) {
    const fid = (row as { facility_id?: string | null }).facility_id;
    if (fid) merged.push(fid);
  }

  return [...new Set(merged.filter(Boolean))];
}

/** Link coach to a facility after they pick it on a session (idempotent). */
export async function ensureCoachFacilityLinked(
  admin: SupabaseClient,
  coachId: string,
  facilityId: string
): Promise<void> {
  const { error } = await admin.from('coach_facilities').insert({
    coach_id: coachId,
    facility_id: facilityId,
  });
  if (error && error.code !== '23505') {
    throw new Error(error.message);
  }
}

/** True when facility exists on the global admin-approved list. */
export async function isApprovedFacility(
  admin: SupabaseClient,
  facilityId: string
): Promise<boolean> {
  const { data } = await admin.from('facilities').select('id').eq('id', facilityId).maybeSingle();
  return !!data;
}

export async function coachHasFacility(
  admin: SupabaseClient,
  _coachId: string,
  facilityId: string
): Promise<boolean> {
  return isApprovedFacility(admin, facilityId);
}

export function normalizeFacilityIdParam(raw: unknown): string | null {
  return normalizeUuidParam(raw);
}

export type CoachFacilityOption = {
  id: string;
  name: string;
  school?: string | null;
  address?: string | null;
  directions?: string | null;
};

/** All tenant facilities (admin session edit). */
export async function getAllFacilitiesForEdit(admin: SupabaseClient): Promise<CoachFacilityOption[]> {
  const { data, error } = await admin
    .from('facilities')
    .select('id, name, school, address')
    .order('name');
  if (error) return [];
  return (data ?? []) as CoachFacilityOption[];
}

/** Facilities for coach session create/edit — all admin-approved sites. */
export async function getCoachFacilitiesForEdit(
  admin: SupabaseClient,
  _coachId: string,
  currentFacilityId?: string | null
): Promise<CoachFacilityOption[]> {
  const global = await getAllFacilitiesForEdit(admin);
  if (!currentFacilityId || global.some((f) => f.id === currentFacilityId)) {
    return global;
  }
  const { data, error } = await admin
    .from('facilities')
    .select('id, name, school, address')
    .eq('id', currentFacilityId)
    .maybeSingle();
  if (error || !data) return global;
  return [...global, data as CoachFacilityOption].sort((a, b) => a.name.localeCompare(b.name));
}
