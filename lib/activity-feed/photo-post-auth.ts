import type { SupabaseClient } from '@supabase/supabase-js';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';

export type PhotoPostActor = {
  userId: string;
  role: string;
  coachId: string | null;
};

export type CompletedSessionRow = {
  id: string;
  athlete_id: string;
  scheduled_datetime: string;
  session_type: string | null;
  session_mode: string | null;
  facilities?: { name?: string } | { name?: string }[] | null;
  athletes?: { first_name?: string | null; last_name?: string | null } | { first_name?: string | null; last_name?: string | null }[] | null;
};

export type PhotoSessionWrestler = {
  id: string;
  name: string;
};

export type PhotoSessionOption = {
  id: string;
  scheduled_datetime: string;
  session_type: string | null;
  session_mode: string | null;
  facilityName: string;
  coachName: string;
  wrestlers: PhotoSessionWrestler[];
};

function facilityName(
  facilities: CompletedSessionRow['facilities']
): string {
  if (!facilities) return '—';
  const row = Array.isArray(facilities) ? facilities[0] : facilities;
  return (row as { name?: string } | undefined)?.name?.trim() || '—';
}

function coachNameFromRow(row: CompletedSessionRow): string {
  const raw = row.athletes;
  const coach = Array.isArray(raw) ? raw[0] : raw;
  const name = [coach?.first_name, coach?.last_name].filter(Boolean).join(' ').trim();
  return name || 'Coach';
}

async function wrestlerNameMap(
  admin: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin
    .from('youth_wrestlers')
    .select('id, first_name, last_name')
    .in('id', ids);
  const map = new Map<string, string>();
  for (const w of data ?? []) {
    map.set(
      w.id as string,
      [w.first_name, w.last_name].filter(Boolean).join(' ').trim() || 'Athlete'
    );
  }
  return map;
}

async function participantsBySession(
  admin: SupabaseClient,
  sessionIds: string[]
): Promise<Map<string, PhotoSessionWrestler[]>> {
  if (sessionIds.length === 0) return new Map();

  const { data: parts } = await admin
    .from('session_participants')
    .select('session_id, youth_wrestler_id, roster_first_name, roster_last_name')
    .in('session_id', sessionIds)
    .not('youth_wrestler_id', 'is', null);

  const youthIds = [
    ...new Set(
      (parts ?? [])
        .map((p: { youth_wrestler_id?: string | null }) => p.youth_wrestler_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const names = await wrestlerNameMap(admin, youthIds);
  const out = new Map<string, PhotoSessionWrestler[]>();

  for (const row of parts ?? []) {
    const sid = row.session_id as string;
    const yid = row.youth_wrestler_id as string;
    const rosterName = [row.roster_first_name, row.roster_last_name].filter(Boolean).join(' ').trim();
    const wrestler: PhotoSessionWrestler = {
      id: yid,
      name: names.get(yid) || rosterName || 'Athlete',
    };
    const list = out.get(sid) ?? [];
    if (!list.some((w) => w.id === wrestler.id)) list.push(wrestler);
    out.set(sid, list);
  }

  return out;
}

function toPhotoSessionOption(
  row: CompletedSessionRow,
  wrestlers: PhotoSessionWrestler[]
): PhotoSessionOption {
  return {
    id: row.id,
    scheduled_datetime: row.scheduled_datetime,
    session_type: row.session_type,
    session_mode: row.session_mode,
    facilityName: facilityName(row.facilities),
    coachName: coachNameFromRow(row),
    wrestlers,
  };
}

/** Completed sessions the actor may attach photos to (last 90 days). */
export async function fetchEligiblePhotoSessions(
  admin: SupabaseClient,
  actor: PhotoPostActor
): Promise<PhotoSessionOption[]> {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceIso = since.toISOString();

  const sessionSelect = `
    id,
    athlete_id,
    scheduled_datetime,
    session_type,
    session_mode,
    facilities(name),
    athletes(first_name, last_name)
  `;

  if (actor.role === 'coach' || (actor.role === 'admin' && actor.coachId)) {
    const coachId = actor.role === 'coach' ? actor.userId : actor.coachId!;
    const { data } = await admin
      .from('sessions')
      .select(sessionSelect)
      .eq('athlete_id', coachId)
      .eq('status', 'completed')
      .gte('scheduled_datetime', sinceIso)
      .order('scheduled_datetime', { ascending: false })
      .limit(40);

    const rows = (data ?? []) as CompletedSessionRow[];
    const parts = await participantsBySession(
      admin,
      rows.map((r) => r.id)
    );
    return rows.map((r) => toPhotoSessionOption(r, parts.get(r.id) ?? []));
  }

  let youthIds: string[] = [];
  if (actor.role === 'youth_wrestler') {
    youthIds = [actor.userId];
  } else {
    youthIds = await getParentYouthWrestlerIds(admin, actor.userId);
  }

  if (youthIds.length === 0) return [];

  const { data: partRows } = await admin
    .from('session_participants')
    .select('session_id')
    .in('youth_wrestler_id', youthIds);

  const sessionIds = [
    ...new Set(
      (partRows ?? []).map((p: { session_id: string }) => p.session_id).filter(Boolean)
    ),
  ];
  if (sessionIds.length === 0) return [];

  const { data } = await admin
    .from('sessions')
    .select(sessionSelect)
    .in('id', sessionIds)
    .eq('status', 'completed')
    .gte('scheduled_datetime', sinceIso)
    .order('scheduled_datetime', { ascending: false })
    .limit(40);

  const rows = (data ?? []) as CompletedSessionRow[];
  const parts = await participantsBySession(
    admin,
    rows.map((r) => r.id)
  );

  return rows.map((r) => {
    const all = parts.get(r.id) ?? [];
    const mine = all.filter((w) => youthIds.includes(w.id));
    return toPhotoSessionOption(r, mine.length > 0 ? mine : all);
  });
}

export async function assertCanPostPhotosToSession(
  admin: SupabaseClient,
  actor: PhotoPostActor,
  sessionId: string,
  youthWrestlerId: string | null
): Promise<
  | { ok: true; session: { id: string; athlete_id: string }; actorParentId: string | null }
  | { ok: false; status: number; error: string }
> {
  const { data: session, error } = await admin
    .from('sessions')
    .select('id, athlete_id, status')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !session) {
    return { ok: false, status: 404, error: 'Session not found' };
  }
  if (session.status !== 'completed') {
    return { ok: false, status: 400, error: 'Photos can only be shared from completed sessions' };
  }

  const coachId = session.athlete_id as string;

  if (actor.role === 'coach' && actor.userId === coachId) {
    return { ok: true, session: { id: session.id, athlete_id: coachId }, actorParentId: null };
  }

  if (actor.role === 'admin') {
    if (actor.coachId && actor.coachId === coachId) {
      return { ok: true, session: { id: session.id, athlete_id: coachId }, actorParentId: null };
    }
  }

  if (youthWrestlerId) {
    const youthIds =
      actor.role === 'youth_wrestler'
        ? [actor.userId]
        : await getParentYouthWrestlerIds(admin, actor.userId);

    if (!youthIds.includes(youthWrestlerId)) {
      return { ok: false, status: 403, error: 'Not authorized for this wrestler' };
    }

    const { data: part } = await admin
      .from('session_participants')
      .select('id')
      .eq('session_id', sessionId)
      .eq('youth_wrestler_id', youthWrestlerId)
      .maybeSingle();

    if (!part) {
      return { ok: false, status: 400, error: 'This wrestler was not on that session roster' };
    }

    const actorParentId = actor.role === 'youth_wrestler' ? null : actor.userId;
    return {
      ok: true,
      session: { id: session.id, athlete_id: coachId },
      actorParentId,
    };
  }

  if (actor.role === 'coach' || (actor.role === 'admin' && actor.coachId === coachId)) {
    return { ok: true, session: { id: session.id, athlete_id: coachId }, actorParentId: null };
  }

  return { ok: false, status: 403, error: 'Not authorized to post photos for this session' };
}

/** Whether the viewer may add or remove photos on a feed post. */
export async function canManagePhotoPost(
  admin: SupabaseClient,
  actor: PhotoPostActor,
  post: {
    session_id?: string | null;
    youth_wrestler_id?: string | null;
  }
): Promise<boolean> {
  if (actor.role === 'admin') return true;
  const sessionId = post.session_id?.trim();
  if (!sessionId) return false;
  const access = await assertCanPostPhotosToSession(
    admin,
    actor,
    sessionId,
    post.youth_wrestler_id ?? null
  );
  return access.ok;
}

export async function attachPhotoPostManageFlags<T extends {
  id: string;
  trigger_type: string;
  session_id?: string | null;
  youth_wrestler_id?: string | null;
  viewer_can_manage_photos?: boolean;
}>(
  admin: SupabaseClient,
  posts: T[],
  actor: PhotoPostActor
): Promise<T[]> {
  const flagged = await Promise.all(
    posts.map(async (post) => {
      if (post.trigger_type !== 'photo_post') return post;
      const viewer_can_manage_photos = await canManagePhotoPost(admin, actor, post);
      return { ...post, viewer_can_manage_photos };
    })
  );
  return flagged;
}
