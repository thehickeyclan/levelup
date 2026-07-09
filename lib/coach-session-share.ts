import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';

export type CoachSessionShareInput = {
  id: string;
  join_policy?: string | null;
  partner_invite_code?: string | null;
  scheduled_datetime?: string | null;
  session_type?: string | null;
  session_mode?: string | null;
};

export function coachSessionRegistrationPath(sessionId: string): string {
  return `/sessions/${sessionId}/register`;
}

export function coachSessionJoinPath(partnerInviteCode?: string | null): string | null {
  const code = partnerInviteCode?.trim();
  if (!code) return null;
  return `/join/${code.toUpperCase()}`;
}

/** Primary link for families to sign up (invite join when invite-only, else register). */
export function coachSessionSharePath(session: CoachSessionShareInput): string {
  const joinPath = coachSessionJoinPath(session.partner_invite_code);
  if (session.join_policy === 'invite_only' && joinPath) return joinPath;
  return coachSessionRegistrationPath(session.id);
}

export function coachSessionShareUrl(origin: string, session: CoachSessionShareInput): string {
  const base = origin.replace(/\/$/, '');
  return `${base}${coachSessionSharePath(session)}`;
}

export function coachSessionRegistrationUrl(origin: string, sessionId: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}${coachSessionRegistrationPath(sessionId)}`;
}

export function coachSessionJoinUrl(origin: string, partnerInviteCode?: string | null): string | null {
  const path = coachSessionJoinPath(partnerInviteCode);
  if (!path) return null;
  const base = origin.replace(/\/$/, '');
  return `${base}${path}`;
}

export function buildCoachSessionShareMessage(opts: {
  coachName: string;
  session: CoachSessionShareInput;
  facility?: string;
  url: string;
  /** Coach schedule page — all upcoming sessions (bio / weekly posts). */
  scheduleUrl?: string;
}): string {
  const { coachName, session, facility, url, scheduleUrl } = opts;
  const typeLabel = getSessionTypeDisplay(session.session_type, session.session_mode).label;
  const dt = session.scheduled_datetime ? new Date(session.scheduled_datetime) : null;
  const when =
    dt && !Number.isNaN(dt.getTime())
      ? `${formatEST(dt, 'EEE, MMM d')} at ${formatEST(dt, 'h:mm a')}`
      : 'upcoming';
  const loc = facility?.trim() && facility !== '—' ? ` at ${facility.trim()}` : '';
  const scheduleTail = scheduleUrl?.trim()
    ? ` More times: ${scheduleUrl.trim()}`
    : '';
  return `Join my ${typeLabel} session with ${coachName} — ${when}${loc}. Sign up: ${url}${scheduleTail}`;
}
