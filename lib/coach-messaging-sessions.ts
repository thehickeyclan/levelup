import { showSessionSmsCopyAndTextGroup } from '@/lib/session-sms-tools';

export type CoachMessagingSessionRow = {
  id: string;
  scheduled_datetime: string;
  session_type: string | null;
  session_mode: string | null;
  status: string;
  current_participants: number;
  max_participants: number;
  facility_name: string;
  wrestler_names: string[];
};

/** Sessions coaches can message from the Messages hub (groups, partner, multi-spot). */
export function isCoachHubMessageableSession(session: {
  session_type?: string | null;
  session_mode?: string | null;
  max_participants?: number | null;
  current_participants?: number | null;
}): boolean {
  if (
    showSessionSmsCopyAndTextGroup({
      session_type: session.session_type ?? undefined,
      session_mode: session.session_mode ?? undefined,
      max_participants: session.max_participants ?? undefined,
      current_participants: session.current_participants ?? undefined,
    })
  ) {
    return true;
  }
  const st = session.session_type ?? '';
  if (st === 'small_group' || st === 'group' || st === '2-athlete') return true;
  const max = session.max_participants ?? 1;
  if (max > 1) return true;
  const mode = session.session_mode ?? '';
  if (mode === 'partner-open' || mode === 'partner-invite') return true;
  return false;
}

export function coachMessagingSessionSearchHaystack(
  row: CoachMessagingSessionRow,
  dateLabel: string
): string {
  return [
    dateLabel,
    row.facility_name,
    row.session_type ?? '',
    row.wrestler_names.join(' '),
  ]
    .join(' ')
    .toLowerCase();
}
