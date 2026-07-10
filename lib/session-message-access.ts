import type { SupabaseClient } from '@supabase/supabase-js';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';

export type SessionMessageAccess = {
  allowed: boolean;
  coachUserId: string | null;
  participantIds: string[];
};

/** Who may read/write session-scoped guild threads (coach + booking parents). */
export async function getSessionMessageAccess(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<SessionMessageAccess> {
  const { data: session } = await supabase
    .from('sessions')
    .select('id, parent_id, athlete_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session?.athlete_id) {
    return { allowed: false, coachUserId: null, participantIds: [] };
  }

  const coachUserId = session.athlete_id as string;
  const participantIds = new Set<string>([coachUserId]);

  const { data: userData } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  if (userData?.role === 'admin') {
    const { data: partRows } = await supabase
      .from('session_participants')
      .select('parent_id')
      .eq('session_id', sessionId);
    for (const row of partRows ?? []) {
      if (row.parent_id) participantIds.add(row.parent_id as string);
    }
    if (session.parent_id && session.parent_id !== coachUserId) {
      participantIds.add(session.parent_id as string);
    }
    return { allowed: true, coachUserId, participantIds: [...participantIds] };
  }

  if (userId === coachUserId) {
    const { data: partRows } = await supabase
      .from('session_participants')
      .select('parent_id')
      .eq('session_id', sessionId);
    for (const row of partRows ?? []) {
      if (row.parent_id) participantIds.add(row.parent_id as string);
    }
    if (session.parent_id && session.parent_id !== coachUserId) {
      participantIds.add(session.parent_id as string);
    }
    return { allowed: true, coachUserId, participantIds: [...participantIds] };
  }

  if (session.parent_id === userId) {
    participantIds.add(userId);
    return { allowed: true, coachUserId, participantIds: [...participantIds] };
  }

  const { data: asParticipant } = await supabase
    .from('session_participants')
    .select('parent_id')
    .eq('session_id', sessionId)
    .eq('parent_id', userId)
    .maybeSingle();

  if (asParticipant?.parent_id) {
    participantIds.add(userId);
    return { allowed: true, coachUserId, participantIds: [...participantIds] };
  }

  const youthIds = await getParentYouthWrestlerIds(supabase, userId);
  if (youthIds.length > 0) {
    const { data: kidRow } = await supabase
      .from('session_participants')
      .select('parent_id')
      .eq('session_id', sessionId)
      .in('youth_wrestler_id', youthIds)
      .limit(1)
      .maybeSingle();
    if (kidRow?.parent_id) {
      participantIds.add(kidRow.parent_id as string);
      return { allowed: true, coachUserId, participantIds: [...participantIds] };
    }
  }

  return { allowed: false, coachUserId, participantIds: [] };
}
