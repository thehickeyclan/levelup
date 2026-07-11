import type { SupabaseClient } from '@supabase/supabase-js';
import { displayNameFromSessionParticipant } from '@/lib/session-participant-display-name';

export type CoachSessionRosterRow = {
  id: string;
  wrestlerId: string | null;
  wrestlerName: string;
  photoUrl: string | null;
  paid: boolean;
  amountPaid: number;
  isDropIn: boolean;
};

type ParticipantRecord = {
  id: string;
  amount_paid?: number | null;
  paid?: boolean | null;
  youth_wrestler_id?: string | null;
  roster_first_name?: string | null;
  roster_last_name?: string | null;
  roster_photo_url?: string | null;
  youth_wrestlers?:
    | { id?: string; first_name?: string | null; last_name?: string | null; photo_url?: string | null }
    | Array<{ id?: string; first_name?: string | null; last_name?: string | null; photo_url?: string | null }>
    | null;
};

/** Load roster rows for coach move / roster UI (service-role client). */
export async function fetchCoachSessionRosterRows(
  admin: SupabaseClient,
  sessionId: string
): Promise<{ roster: CoachSessionRosterRow[]; error?: string }> {
  const { data: participants, error } = await admin
    .from('session_participants')
    .select(
      `
      id,
      amount_paid,
      paid,
      youth_wrestler_id,
      roster_first_name,
      roster_last_name,
      roster_photo_url,
      youth_wrestlers(id, first_name, last_name, photo_url)
    `
    )
    .eq('session_id', sessionId);

  if (error) {
    return { roster: [], error: error.message };
  }

  const roster = (participants ?? []).map((p) => {
    const row = p as ParticipantRecord;
    const youthId = row.youth_wrestler_id ?? null;
    const ywRaw = row.youth_wrestlers;
    const yw = Array.isArray(ywRaw) ? ywRaw[0] : ywRaw;
    const name =
      displayNameFromSessionParticipant(row) ||
      (youthId && yw && (yw.first_name || yw.last_name)
        ? [yw.first_name, yw.last_name].filter(Boolean).join(' ').trim()
        : null) ||
      (youthId ? 'Athlete' : 'Drop-in');

    const photoUrl =
      row.roster_photo_url?.trim() ||
      (yw?.photo_url?.trim() ? yw.photo_url.trim() : null) ||
      null;

    return {
      id: row.id,
      wrestlerId: youthId,
      wrestlerName: name,
      photoUrl,
      paid: row.paid === true,
      amountPaid: Number(row.amount_paid ?? 0),
      isDropIn: youthId === null,
    };
  });

  return { roster };
}
