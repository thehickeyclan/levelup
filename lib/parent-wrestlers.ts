import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns youth wrestler IDs tied to this signed-in user: parent household, linked kids, or self (`youth_wrestlers.id = userId`).
 * - Wrestlers where they are the primary parent (parent_id = userId)
 * - Wrestlers where they are a linked parent (youth_wrestler_parents)
 * - Self-managed athlete accounts (`youth_wrestlers.id` = auth user id — not present in lists above).
 * Parents only see household wrestlers plus this self row when relevant.
 */
export async function getParentYouthWrestlerIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const [primaryRes, linkedRes] = await Promise.all([
    supabase.from('youth_wrestlers').select('id').eq('parent_id', userId),
    supabase.from('youth_wrestler_parents').select('youth_wrestler_id').eq('parent_id', userId),
  ]);
  const primaryIds = (primaryRes.data ?? []).map((r: { id: string }) => r.id);
  const linkedIds = (linkedRes.data ?? []).map((r: { youth_wrestler_id: string }) => r.youth_wrestler_id);
  let merged = [...new Set([...primaryIds, ...linkedIds])];
  /** Self-managed wrestler signup: youth_wrestlers.id equals auth users.id (not in parent_id / linkage lists). */
  const { data: selfRow } = await supabase.from('youth_wrestlers').select('id').eq('id', userId).maybeSingle();
  if (selfRow) merged = [...new Set([...merged, userId])];
  return merged;
}
