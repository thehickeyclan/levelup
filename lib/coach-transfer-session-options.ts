import { formatEST } from '@/lib/format-date';

export type CoachTransferSessionOption = {
  id: string;
  scheduled_datetime: string;
  facilityLabel: string;
  current_participants: number;
  max_participants: number;
};

type SessionLike = {
  id: string;
  scheduled_datetime: string;
  status: string;
  current_participants?: number | null;
  max_participants?: number | null;
  facilities?: { name?: string } | { name?: string }[] | null;
};

function facilityLabel(session: SessionLike): string {
  const f = session.facilities;
  if (!f || typeof f !== 'object') return '—';
  const row = Array.isArray(f) ? f[0] : f;
  return (row as { name?: string } | undefined)?.name?.trim() || '—';
}

/** Other scheduled sessions a coach can move a wrestler into (excludes source session). */
export function buildCoachTransferSessionOptions(
  sessions: SessionLike[],
  fromSessionId: string
): CoachTransferSessionOption[] {
  const now = Date.now();
  const todayEastern = formatEST(new Date(), 'yyyy-MM-dd');

  const isEligibleTarget = (scheduledDatetime: string) => {
    const t = new Date(scheduledDatetime).getTime();
    if (t > now) return true;
    return formatEST(new Date(scheduledDatetime), 'yyyy-MM-dd') === todayEastern;
  };

  return sessions
    .filter((s) => s.id !== fromSessionId)
    .filter((s) => s.status === 'scheduled')
    .filter((s) => isEligibleTarget(s.scheduled_datetime))
    .map((s) => ({
      id: s.id,
      scheduled_datetime: s.scheduled_datetime,
      facilityLabel: facilityLabel(s),
      current_participants: s.current_participants ?? 0,
      max_participants: s.max_participants ?? 6,
    }))
    .sort(
      (a, b) =>
        new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
    );
}
