import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Participation waiver version shown at /waiver and recorded per acceptance.
 * Bump when the text changes so records say which version a parent accepted.
 * Text is DRAFT pending attorney review — version stays '-draft' until signed off.
 */
export const WAIVER_VERSION = '2026-11-18-draft';

/**
 * Record a parent's waiver acceptance at checkout. Never blocks the booking:
 * a failed insert (e.g. table not yet applied to prod) logs loudly instead.
 *
 * Requires (hand-applied SQL): table public.waiver_acceptances
 *   (id, parent_id, session_id nullable, source, waiver_version, accepted_at).
 */
export async function recordWaiverAcceptance(
  admin: SupabaseClient,
  opts: {
    parentId: string;
    sessionId?: string | null;
    source: 'booking' | 'register' | 'cart';
  }
): Promise<void> {
  try {
    const { error } = await admin.from('waiver_acceptances').insert({
      parent_id: opts.parentId,
      session_id: opts.sessionId ?? null,
      source: opts.source,
      waiver_version: WAIVER_VERSION,
    });
    if (error) {
      console.error('[waiver] acceptance NOT recorded', opts, error.message);
    }
  } catch (e) {
    console.error('[waiver] acceptance NOT recorded', opts, e);
  }
}
