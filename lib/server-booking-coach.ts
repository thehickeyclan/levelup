import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUuidParam } from '@/lib/normalize-uuid-param';

export type VerifiedBookingCoach = {
  id: string;
  first_name: string;
  last_name: string;
  active: boolean;
  facility_id: string | null;
  /** Coach revenue share of gross (e.g. 0.85); used when creating sessions from parent book flow */
  payout_rate?: number | null;
};

/**
 * Access-first lane: a coach is bookable by direct link from the moment they
 * sign up (status 'pending' = awaiting review, still bookable; legacy null =
 * bookable). Only an explicit 'rejected' or 'suspended' status blocks booking.
 * `athletes.active` remains the PUBLIC DIRECTORY flag only (browse,
 * find-training, mobile directory) — never the booking gate.
 */
export function coachIsBookable(coach: { status?: string | null } | null | undefined): boolean {
  if (!coach) return false;
  const status = coach.status ?? null;
  return status !== 'rejected' && status !== 'suspended';
}

export type VerifyCoachFailure = {
  ok: false;
  status: number;
  error: string;
};

export type VerifyCoachSuccess = {
  ok: true;
  coach: VerifiedBookingCoach;
};

export type VerifyCoachResult = VerifyCoachFailure | VerifyCoachSuccess;

/**
 * Normalize coach / wrestler ids from JSON, query strings, or pasted text.
 * Prefer this over ad-hoc `.trim()` in API routes.
 */
export function normalizeCoachOrWrestlerId(raw: unknown): string | null {
  return normalizeUuidParam(raw);
}

/**
 * Authoritative coach lookup for **parent** booking and session-request flows.
 *
 * **Must** use the service-role (`createAdminClient`) Supabase client. Never use the
 * user-scoped `createClient` to load `public.athletes` by coach id for these flows:
 * RLS can return zero rows even when the coach exists (`active` visibility, edge cases),
 * which surfaces as false "Coach not found" in production.
 */
export async function verifyCoachForParentBooking(
  admin: SupabaseClient,
  coachId: string
): Promise<VerifyCoachResult> {
  const { data: athlete, error } = await admin
    .from('athletes')
    .select('id, first_name, last_name, active, status, facility_id, payout_rate')
    .eq('id', coachId)
    .maybeSingle();

  if (error) {
    console.error('[verifyCoachForParentBooking] athletes', error);
    return { ok: false, status: 500, error: 'Could not verify coach. Try again.' };
  }
  if (!athlete) {
    return { ok: false, status: 404, error: 'Coach not found' };
  }

  const { data: u } = await admin.from('users').select('role').eq('id', coachId).maybeSingle();
  if (u?.role !== 'coach') {
    return { ok: false, status: 400, error: 'That account is not a coach profile.' };
  }
  if (!coachIsBookable(athlete as { status?: string | null })) {
    return {
      ok: false,
      status: 400,
      error: 'This coach is not available for booking right now.',
    };
  }

  return { ok: true, coach: athlete as VerifiedBookingCoach };
}
