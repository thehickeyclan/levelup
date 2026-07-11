import type { CoachSession } from '@/app/(athlete)/athlete-dashboard/coach-schedule-card';
import { displayNameFromSessionParticipant } from '@/lib/session-participant-display-name';

type ParticipantRow = NonNullable<CoachSession['session_participants']>[number];

function participantRows(session: CoachSession): ParticipantRow[] {
  return Array.isArray(session.session_participants) ? session.session_participants : [];
}

/** Guild: `paid = true` means the spot is confirmed on the roster. */
export function sessionHasConfirmedRegistrants(session: CoachSession): boolean {
  return participantRows(session).some((p) => p.paid === true);
}

/** Display names for confirmed (paid) roster rows only. */
export function sessionConfirmedRegistrantNames(session: CoachSession): string[] {
  return participantRows(session)
    .filter((p) => p.paid === true)
    .map(displayNameFromSessionParticipant)
    .filter((n): n is string => Boolean(n));
}
