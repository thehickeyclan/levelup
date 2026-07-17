import type { SupabaseClient } from '@supabase/supabase-js';

export type CoachMessageContact = {
  id: string;
  kind: 'parent' | 'youth';
  name: string;
  email?: string;
  /** Kid names associated with this parent via the coach's sessions (ever). */
  kids?: string[];
};

function displayNameFromEmail(email: string | null | undefined, fallback: string): string {
  if (!email) return fallback;
  const local = email.includes('@') ? email.split('@')[0] : email;
  return local || fallback;
}

function kidLabel(first?: string | null, last?: string | null, rosterFirst?: string | null, rosterLast?: string | null): string | null {
  const name = `${first ?? rosterFirst ?? ''} ${last ?? rosterLast ?? ''}`.trim();
  return name || null;
}

/**
 * Parents and youth athletes a coach may DM: anyone who has ever been
 * registered on (or owned) one of this coach's sessions — not other coaches.
 */
export async function getCoachSessionMessageContacts(
  supabase: SupabaseClient,
  coachUserId: string
): Promise<CoachMessageContact[]> {
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select('id, parent_id')
    .eq('athlete_id', coachUserId);

  if (sessErr) throw new Error(sessErr.message);

  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  const parentIds = new Set<string>();
  const youthIds = new Set<string>();
  /** parentId → set of kid display names */
  const kidsByParent = new Map<string, Set<string>>();

  const addKidForParent = (parentId: string | null | undefined, label: string | null) => {
    if (!parentId || parentId === coachUserId) return;
    parentIds.add(parentId);
    if (!label) return;
    let set = kidsByParent.get(parentId);
    if (!set) {
      set = new Set();
      kidsByParent.set(parentId, set);
    }
    set.add(label);
  };

  for (const s of sessions ?? []) {
    if (s.parent_id) parentIds.add(s.parent_id as string);
  }

  if (sessionIds.length > 0) {
    const { data: parts, error: partErr } = await supabase
      .from('session_participants')
      .select(
        `
        parent_id,
        youth_wrestler_id,
        roster_first_name,
        roster_last_name,
        youth_wrestlers(id, first_name, last_name, parent_id)
      `
      )
      .in('session_id', sessionIds);

    if (partErr) throw new Error(partErr.message);

    for (const p of parts ?? []) {
      const yw = p.youth_wrestlers as
        | { id: string; first_name: string | null; last_name: string | null; parent_id: string | null }
        | { id: string; first_name: string | null; last_name: string | null; parent_id: string | null }[]
        | null;
      const wrestler = Array.isArray(yw) ? yw[0] : yw;
      const label = kidLabel(
        wrestler?.first_name,
        wrestler?.last_name,
        p.roster_first_name as string | null,
        p.roster_last_name as string | null
      );

      if (p.youth_wrestler_id) youthIds.add(p.youth_wrestler_id as string);
      addKidForParent(p.parent_id as string | null, label);
      addKidForParent(wrestler?.parent_id, label);
    }

    const ywList = [...youthIds];
    if (ywList.length > 0) {
      const { data: links } = await supabase
        .from('youth_wrestler_parents')
        .select('parent_id, youth_wrestler_id')
        .in('youth_wrestler_id', ywList);

      const ywNameById = new Map<string, string>();
      for (const p of parts ?? []) {
        const yw = p.youth_wrestlers as
          | { id: string; first_name: string | null; last_name: string | null }
          | { id: string; first_name: string | null; last_name: string | null }[]
          | null;
        const wrestler = Array.isArray(yw) ? yw[0] : yw;
        if (!wrestler?.id) continue;
        const label = kidLabel(
          wrestler.first_name,
          wrestler.last_name,
          p.roster_first_name as string | null,
          p.roster_last_name as string | null
        );
        if (label) ywNameById.set(wrestler.id, label);
      }

      for (const link of links ?? []) {
        const pid = link.parent_id as string;
        const yid = link.youth_wrestler_id as string;
        addKidForParent(pid, ywNameById.get(yid) ?? null);
      }
    }
  }

  // Workspaces still count as a relationship (coach ↔ parent)
  const { data: workspaces } = await supabase
    .from('workspaces')
    .select('parent_id, youth_wrestler_id')
    .eq('athlete_id', coachUserId);

  for (const w of workspaces ?? []) {
    if (w.parent_id) parentIds.add(w.parent_id as string);
    if (w.youth_wrestler_id) youthIds.add(w.youth_wrestler_id as string);
  }

  parentIds.delete(coachUserId);
  youthIds.delete(coachUserId);

  const allCandidateIds = [...new Set([...parentIds, ...youthIds])];
  if (allCandidateIds.length === 0) return [];

  const { data: users } = await supabase
    .from('users')
    .select('id, email, role')
    .in('id', allCandidateIds);

  const userById = new Map(
    (users ?? []).map((u: { id: string; email?: string | null; role?: string | null }) => [u.id, u])
  );

  // Names for youth without relying only on roster snapshots
  const missingYouthNames = [...youthIds].filter((id) => {
    // will fill from youth_wrestlers table
    return true;
  });
  const { data: ywRows } =
    missingYouthNames.length > 0
      ? await supabase
          .from('youth_wrestlers')
          .select('id, first_name, last_name, parent_id')
          .in('id', missingYouthNames)
      : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; parent_id: string | null }> };

  const ywById = new Map(
    (ywRows ?? []).map((y) => [
      y.id,
      `${y.first_name ?? ''} ${y.last_name ?? ''}`.trim() || 'Athlete',
    ])
  );

  for (const y of ywRows ?? []) {
    if (y.parent_id) addKidForParent(y.parent_id, ywById.get(y.id) ?? null);
  }

  const contacts: CoachMessageContact[] = [];

  for (const id of parentIds) {
    const u = userById.get(id);
    // Skip coaches / unknown roles that aren't parents (or admin acting as parent)
    if (u?.role === 'coach') continue;
    if (u && u.role !== 'parent' && u.role !== 'admin' && u.role !== 'youth_wrestler') continue;

    const kids = [...(kidsByParent.get(id) ?? [])].sort((a, b) => a.localeCompare(b));
    contacts.push({
      id,
      kind: 'parent',
      name: displayNameFromEmail(u?.email, kids[0] ? `Parent of ${kids[0]}` : 'Parent'),
      email: u?.email ?? undefined,
      kids: kids.length ? kids : undefined,
    });
  }

  for (const id of youthIds) {
    const u = userById.get(id);
    // Only message kids who have their own Guild login
    if (!u) continue;
    if (u.role !== 'youth_wrestler' && u.role !== 'parent') continue;
    // If they're only a parent account that also appears as youth id, skip duplicate parent card
    if (u.role === 'parent' && parentIds.has(id)) continue;

    contacts.push({
      id,
      kind: 'youth',
      name: ywById.get(id) ?? displayNameFromEmail(u.email, 'Athlete'),
      email: u.email ?? undefined,
    });
  }

  contacts.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'parent' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return contacts;
}

/** Whether this coach may open a DM with the given user id. */
export async function coachMayMessageUser(
  supabase: SupabaseClient,
  coachUserId: string,
  otherUserId: string
): Promise<boolean> {
  if (!otherUserId || otherUserId === coachUserId) return false;
  const contacts = await getCoachSessionMessageContacts(supabase, coachUserId);
  return contacts.some((c) => c.id === otherUserId);
}
