import type { SupabaseClient } from '@supabase/supabase-js';

export type CoachLocationRow = {
  id: string;
  name: string;
  school: string;
  address: string | null;
  directions: string | null;
};

export type CreateCoachLocationInput = {
  name: string;
  address: string;
  directions?: string | null;
  school?: string | null;
};

const FACILITY_SELECT = 'id, name, school, address';

/** Best-effort: `directions` column exists after migration 20260531140000. */
async function saveFacilityDirections(
  admin: SupabaseClient,
  facilityId: string,
  directions: string
): Promise<boolean> {
  const { error } = await admin.from('facilities').update({ directions }).eq('id', facilityId);
  if (!error) return true;
  if (error.message?.includes('directions') || error.code === '42703') return false;
  throw new Error(error.message);
}

/**
 * Coach adds a wrestling room / travel venue: creates (or reuses) a facility row and
 * links it in coach_facilities so it appears in session create and booking flows.
 */
export async function createCoachLocation(
  admin: SupabaseClient,
  coachId: string,
  input: CreateCoachLocationInput
): Promise<CoachLocationRow> {
  const name = input.name.trim();
  const address = input.address.trim();
  const directions =
    typeof input.directions === 'string' && input.directions.trim()
      ? input.directions.trim()
      : null;

  if (!name) throw new Error('Location name is required');
  if (!address || address.length < 5) {
    throw new Error('Enter a full street address (at least 5 characters)');
  }

  const { data: athlete } = await admin
    .from('athletes')
    .select('school')
    .eq('id', coachId)
    .maybeSingle();

  const school =
    (typeof input.school === 'string' && input.school.trim()) ||
    (athlete as { school?: string } | null)?.school?.trim() ||
    'Travel';

  const insertPayload = { name, school, address };

  let facilityId: string;
  let row: CoachLocationRow;

  const { data: inserted, error: insertErr } = await admin
    .from('facilities')
    .insert(insertPayload)
    .select(FACILITY_SELECT)
    .single();

  if (insertErr?.code === '23505') {
    const { data: existing, error: findErr } = await admin
      .from('facilities')
      .select(FACILITY_SELECT)
      .eq('school', school)
      .eq('name', name)
      .maybeSingle();
    if (findErr || !existing) throw new Error(insertErr.message);
    facilityId = (existing as { id: string }).id;
    row = existing as CoachLocationRow;
    if (address && row.address !== address) {
      await admin.from('facilities').update({ address }).eq('id', facilityId);
      row = { ...row, address };
    }
  } else if (insertErr || !inserted) {
    throw new Error(insertErr?.message ?? 'Could not create location');
  } else {
    facilityId = (inserted as { id: string }).id;
    row = inserted as CoachLocationRow;
  }

  let savedDirections: string | null = null;
  if (directions) {
    const ok = await saveFacilityDirections(admin, facilityId, directions);
    if (ok) {
      savedDirections = directions;
      row = { ...row, directions };
    } else {
      // Migration not applied yet — fold instructions into address so parents still see them.
      const combined = `${address} (${directions})`;
      await admin.from('facilities').update({ address: combined }).eq('id', facilityId);
      row = { ...row, address: combined, directions: null };
    }
  }

  const { error: linkErr } = await admin.from('coach_facilities').insert({
    coach_id: coachId,
    facility_id: facilityId,
  });
  if (linkErr && linkErr.code !== '23505') {
    throw new Error(linkErr.message);
  }

  return row;
}
