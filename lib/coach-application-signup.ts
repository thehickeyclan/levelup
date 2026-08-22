/**
 * Coach application signup — payloads inserted into `public.users` and `public.athletes`.
 * Keep insert keys in sync with Supabase migrations; tests assert keys match these lists.
 */

export type CoachApplicationUserInsertInput = {
  userId: string;
  emailNormalized: string;
  firstName: string;
  lastName: string;
  phoneDigits: string;
};

/** Columns written by coach application to `public.users` (must exist in DB). */
export const COACH_APPLICATION_USERS_INSERT_KEYS = [
  'id',
  'email',
  'role',
  'first_name',
  'last_name',
  'phone',
] as const;

export function buildCoachApplicationUserInsert(input: CoachApplicationUserInsertInput) {
  return {
    id: input.userId,
    email: input.emailNormalized,
    role: 'coach' as const,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    phone: input.phoneDigits,
  };
}

export type CoachApplicationAthleteInsertInput = {
  userId: string;
  firstName: string;
  lastName: string;
  school: string;
  coachType: 'ncaa_athlete' | 'former_college_athlete' | 'club_hs_coach';
  weightClass: string | null;
  bio: string;
  dateOfBirth: string;
  payoutMethod: 'venmo' | 'zelle' | null;
  venmoHandle: string | null;
  zelleContact: string | null;
  hasSafeSport: boolean;
  safeSportExpiry: string | null;
  hasUsaWrestling: boolean;
  usaWrestlingExpiry: string | null;
  hasBackgroundCheck: boolean;
  backgroundCheckDate: string | null;
  tshirtSize: string | null;
};

/** YYYY-MM-DD or null for Postgres DATE columns (matches public.athletes column names from migrations). */
function toPgDateOrNull(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') return null;
  const s = String(value).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Columns written by coach application to `public.athletes`.
 * Uses DB names: zelle_email, safesport_expiration, background_check_expiration (not legacy app-only names).
 */
export const COACH_APPLICATION_ATHLETE_INSERT_KEYS = [
  'id',
  'first_name',
  'last_name',
  'school',
  'coach_type',
  'weight_class',
  'bio',
  'active',
  'status',
  'date_of_birth',
  'payout_method',
  'venmo_handle',
  'zelle_email',
  'safesport_certified',
  'safesport_expiration',
  'usa_wrestling_certified',
  'usa_wrestling_expiration',
  'background_check',
  'background_check_expiration',
  'tshirt_size',
  'agreement_signed_at',
] as const;

export function buildCoachApplicationAthleteInsert(input: CoachApplicationAthleteInsertInput) {
  return {
    id: input.userId,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    school: input.school.trim(),
    coach_type: input.coachType,
    weight_class: input.weightClass || null,
    bio: input.bio.trim(),
    active: false,
    status: 'pending' as const,
    date_of_birth: input.dateOfBirth,
    payout_method: input.payoutMethod,
    venmo_handle: input.venmoHandle?.trim() || null,
    zelle_email: input.zelleContact?.trim() || null,
    safesport_certified: input.hasSafeSport || false,
    safesport_expiration: toPgDateOrNull(input.safeSportExpiry ?? null),
    usa_wrestling_certified: input.hasUsaWrestling || false,
    usa_wrestling_expiration: toPgDateOrNull(input.usaWrestlingExpiry ?? null),
    background_check: input.hasBackgroundCheck || false,
    background_check_expiration: toPgDateOrNull(input.backgroundCheckDate ?? null),
    tshirt_size: input.tshirtSize || null,
    agreement_signed_at: new Date().toISOString(),
  };
}
