import { cookies, headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export type CoachActorResolved =
  | { ok: true; coachId: string; useAdminClient: boolean }
  | { ok: false; status: number; error: string };

/**
 * Who is being edited when managing coach availability: the signed-in coach, or the coach
 * chosen via "preview as coach" (admin only). Admins need the service-role client for writes
 * because RLS ties rows to auth.uid() (the coach's user id).
 */
export async function resolveCoachActorId(
  supabase: SupabaseClient,
  authUserId: string
): Promise<CoachActorResolved> {
  const { data: userData, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUserId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  if (!userData?.role) {
    return {
      ok: false,
      status: 403,
      error: 'Your account has no role on file. Try logging out and back in, or contact support.',
    };
  }

  if (userData.role === 'coach') {
    return { ok: true, coachId: authUserId, useAdminClient: false };
  }

  if (userData.role === 'admin') {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
    const viewAs =
      headerStore.get('x-levelup-coach-id')?.trim() ||
      cookieStore.get('levelup_view_as_coach_id')?.value?.trim();
    if (!viewAs) {
      return {
        ok: false,
        status: 400,
        error: 'Choose a coach in the header (preview as coach) to edit this calendar.',
      };
    }
    return { ok: true, coachId: viewAs, useAdminClient: true };
  }

  return { ok: false, status: 403, error: 'Forbidden' };
}

export function dbForCoachActor(tenantSlug: string, actor: CoachActorResolved & { ok: true }, userClient: SupabaseClient) {
  return actor.useAdminClient ? createAdminClient(tenantSlug) : userClient;
}
