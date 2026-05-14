import type { SessionMode } from '@/types';

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I to avoid confusion

/** Generate a unique 8-char invite code (caller should ensure uniqueness in DB) */
export function generateInviteCode(): string {
  let code = '';
  const arr = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 8; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 8; i++) {
    code += INVITE_CODE_CHARS[arr[i] % INVITE_CODE_CHARS.length];
  }
  return code;
}

export interface SessionPricing {
  oneOnOne: number;
  twoAthlete: number;
  groupRate: number;
}

/** Calculate price for a session based on mode and participant count */
export function getSessionPrice(
  sessionMode: SessionMode,
  numParticipants: number,
  pricing: SessionPricing
): { total: number; basePrice?: number; pricePerParticipant?: number } {
  switch (sessionMode) {
    case 'private':
      return { total: pricing.oneOnOne, basePrice: pricing.oneOnOne, pricePerParticipant: pricing.oneOnOne };
    case 'sibling':
      const perAthlete = pricing.twoAthlete / 2;
      return {
        total: perAthlete * numParticipants,
        basePrice: undefined,
        pricePerParticipant: perAthlete,
      };
    case 'partner-invite':
    case 'partner-open':
      const partnerPer = pricing.twoAthlete / 2;
      return {
        total: partnerPer * Math.max(1, numParticipants),
        basePrice: undefined,
        pricePerParticipant: partnerPer,
      };
    default:
      return { total: pricing.oneOnOne, basePrice: pricing.oneOnOne, pricePerParticipant: pricing.oneOnOne };
  }
}

/** Check if a session can be joined (e.g. by invite code or open) - logic only; caller passes session row */
export function canJoinSession(
  session: { session_mode: string; current_participants: number; max_participants: number } | null
): boolean {
  if (!session) return false;
  if (session.session_mode !== 'partner-invite' && session.session_mode !== 'partner-open') return false;
  return session.current_participants < session.max_participants;
}

/** Create a notification (caller uses Supabase client with service role or RLS allows insert for user_id = auth.uid()) */
export type NotificationType =
  | 'join_request_received'
  | 'join_request_approved'
  | 'join_request_declined'
  | 'partner_24h_reminder';

export function createNotificationPayload(
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  data: Record<string, unknown> = {}
): { user_id: string; type: string; title: string; body?: string; data: Record<string, unknown> } {
  return {
    user_id: userId,
    type,
    title,
    body: body ?? undefined,
    data: { ...data },
  };
}

/** Human-readable titles for notification types */
export const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  join_request_received: 'Join request received for your session',
  join_request_approved: 'Your join request was approved',
  join_request_declined: 'Your join request was declined',
  partner_24h_reminder: '24 hours until your session - still need a partner?',
};

const TERMINAL_SESSION_STATUSES = new Set(['completed', 'cancelled', 'no-show']);

/** How far back to query session start times before filtering to in-progress/future (covers long sessions). */
const SESSION_LIST_QUERY_LOOKBACK_HOURS = 8;

/** Lower bound ISO timestamp for parent-facing session lists (Training, Book) so in-progress sessions still load. */
export function sessionListQueryLowerBoundIso(lookbackHours = SESSION_LIST_QUERY_LOOKBACK_HOURS): string {
  return new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
}

/**
 * True if the session has not ended yet (scheduled, by wall clock) — still bookable/joinable in UI lists.
 * Uses `duration_minutes` when set; otherwise assumes {@link DEFAULT_LISTING_DURATION_FALLBACK_MIN}.
 */
const DEFAULT_LISTING_DURATION_FALLBACK_MIN = 120;

export function isSessionInProgressOrUpcoming(s: {
  scheduled_datetime: string;
  duration_minutes?: number | null;
  status?: string | null;
}): boolean {
  if (TERMINAL_SESSION_STATUSES.has((s.status ?? '') as string)) return false;
  const startMs = new Date(s.scheduled_datetime).getTime();
  if (Number.isNaN(startMs)) return false;
  if (startMs >= Date.now()) return true;
  const dm = Number(s.duration_minutes);
  const mins = Number.isFinite(dm) && dm > 0 ? dm : DEFAULT_LISTING_DURATION_FALLBACK_MIN;
  const endMs = startMs + mins * 60_000;
  return endMs > Date.now();
}

/**
 * Seats filled for capacity UI and gates.
 *
 * When roster data is authoritative (exact COUNT from DB, or `session_participants` array from a
 * query), use **row count only**. The denormalized `current_participants` column can sit **above**
 * the real roster (e.g. bump without a row) and would wrongly block join/checkout as "full".
 *
 * When roster was not loaded, fall back to max(rows, column) so lists without embedded participants
 * still behave.
 */
function participantRowCount(session: {
  session_participants?: unknown[] | null;
}, override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override)) return Math.max(0, override);
  const sp = session.session_participants;
  if (Array.isArray(sp)) return sp.length;
  return 0;
}

export function getEffectiveFilledCount(
  session: {
    current_participants?: number | null;
    max_participants?: number | null;
    session_participants?: unknown[] | null;
  },
  participantRowCountOverride?: number
): number {
  const rows = participantRowCount(session, participantRowCountOverride);

  const fromColRaw = session.current_participants;
  const fromCol =
    typeof fromColRaw === 'number' && Number.isFinite(fromColRaw)
      ? fromColRaw
      : typeof fromColRaw === 'string'
        ? parseInt(fromColRaw, 10)
        : 0;
  const fromColSafe = Number.isFinite(fromCol) ? fromCol : 0;

  const rosterIsAuthoritative =
    typeof participantRowCountOverride === 'number' || Array.isArray(session.session_participants);

  const effectiveCount = rosterIsAuthoritative ? rows : Math.max(rows, fromColSafe);

  const max = session.max_participants;
  if (max == null || max <= 0) return effectiveCount;
  return Math.min(effectiveCount, max);
}

/** Use when UI lists names from session_participants so the badge cannot stay behind the roster (stale current_participants column). */
export function getEffectiveFilledCountWithListedNames(
  session: {
    current_participants?: number | null;
    max_participants?: number | null;
    session_participants?: unknown[] | null;
  },
  listedNameCount: number,
  participantRowCountOverride?: number
): number {
  const base = getEffectiveFilledCount(session, participantRowCountOverride);
  const listed = Math.max(0, Math.floor(listedNameCount));
  const max = session.max_participants;
  const raw = Math.max(base, listed);
  if (max == null || max <= 0) return raw;
  return Math.min(raw, max);
}

/**
 * For Training / find-training lists: is this session bookable as "open" (has spots left)?
 * If max_participants is missing in DB, do not treat as max=1 (that wrongly marked multi-kid groups as full).
 */
export function isSessionOpenForParentBrowse(s: {
  status?: string | null;
  current_participants?: number | null;
  max_participants?: number | null;
  session_participants?: unknown[] | null;
}): boolean {
  if (TERMINAL_SESSION_STATUSES.has((s.status ?? '') as string)) return false;
  const max = s.max_participants;
  if (max == null || max <= 0) return true;
  const filled = getEffectiveFilledCount(s);
  return filled < max;
}

/** Past/cancelled or truly at capacity (requires valid max_participants). */
export function isSessionClosedForParentBrowse(s: {
  status?: string | null;
  current_participants?: number | null;
  max_participants?: number | null;
  session_participants?: unknown[] | null;
}): boolean {
  if (TERMINAL_SESSION_STATUSES.has((s.status ?? '') as string)) return true;
  const max = s.max_participants;
  if (max == null || max <= 0) return false;
  const filled = getEffectiveFilledCount(s);
  return filled >= max;
}
