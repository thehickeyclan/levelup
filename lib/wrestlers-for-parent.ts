import type { SupabaseClient } from '@supabase/supabase-js';

export type ParentWrestlerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url?: string | null;
};

/** Wrestler IDs the signed-in parent or self-managed athlete may book or use in cart checkout. */
export async function verifyWrestlerBelongsToParentOrSelf(
  supabase: SupabaseClient,
  userId: string,
  wrestlerId: string
): Promise<boolean> {
  const { data: yw } = await supabase
    .from('youth_wrestlers')
    .select('id, parent_id')
    .eq('id', wrestlerId)
    .maybeSingle();
  if (!yw) return false;
  /** Self-managed youth accounts (signup): users.id equals youth_wrestlers.id. */
  if (wrestlerId === userId) return true;
  const ywParentId = (yw as { parent_id?: string | null }).parent_id;
  if (ywParentId === userId) return true;
  const { data: link } = await supabase
    .from('youth_wrestler_parents')
    .select('id')
    .eq('youth_wrestler_id', wrestlerId)
    .eq('parent_id', userId)
    .maybeSingle();
  return !!link;
}

/** Youth wrestlers the parent can choose: primary children plus rows linked via youth_wrestler_parents. */
export async function getWrestlersForParentUser(
  supabase: SupabaseClient,
  userId: string
): Promise<ParentWrestlerRow[]> {
  const { data: primaryRows, error: primaryErr } = await supabase
    .from('youth_wrestlers')
    .select('id, first_name, last_name, photo_url')
    .eq('parent_id', userId);

  if (primaryErr) {
    console.error('getWrestlersForParentUser primary:', primaryErr.message);
  }

  const { data: linkedIds } = await supabase
    .from('youth_wrestler_parents')
    .select('youth_wrestler_id')
    .eq('parent_id', userId);

  const linkedIdList = [...new Set((linkedIds ?? []).map((r: { youth_wrestler_id: string }) => r.youth_wrestler_id))];

  const { data: linkedRows } =
    linkedIdList.length > 0
      ? await supabase
          .from('youth_wrestlers')
          .select('id, first_name, last_name, photo_url')
          .in('id', linkedIdList)
      : { data: [] as ParentWrestlerRow[] };

  const byId = new Map<string, ParentWrestlerRow>();
  for (const r of [...(primaryRows ?? []), ...(linkedRows ?? [])]) {
    byId.set(r.id, r as ParentWrestlerRow);
  }

  /** Same account owns the youth wrestler row (signup as athlete). Parents never collide: their user id ≠ child wrestler ids. */
  const { data: selfRow } = await supabase
    .from('youth_wrestlers')
    .select('id, first_name, last_name, photo_url')
    .eq('id', userId)
    .maybeSingle();
  if (selfRow && !byId.has((selfRow as ParentWrestlerRow).id)) {
    byId.set((selfRow as ParentWrestlerRow).id, selfRow as ParentWrestlerRow);
  }

  return Array.from(byId.values()).sort((a, b) =>
    `${a.first_name ?? ''} ${a.last_name ?? ''}`.localeCompare(`${b.first_name ?? ''} ${b.last_name ?? ''}`, undefined, {
      sensitivity: 'base',
    })
  );
}
