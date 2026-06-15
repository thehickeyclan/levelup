import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import { VIEW_AS_COOKIE_NAME } from '@/lib/auth/view-as-cookie';

/** In-app alerts shown when the UI is in coach mode (coach account or admin preview-as-coach). */
export const COACH_NOTIFICATION_TYPES = new Set([
  'new_session',
  'session_booked',
  'session_cancelled',
  'session_rescheduled',
  'session_join_request',
  'session_join_approved',
  'coach_inquiry_message',
  'parent_session_request_reminder',
  'parent_session_request_response',
  'session_payout_recorded',
]);

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationAudienceContext = {
  authUserId: string;
  userRole: string | null;
  viewAsRole: string | null;
  viewAsCoachId: string | null;
};

export function readNotificationAudienceFromCookies(
  cookieStore: ReadonlyRequestCookies,
  userRole: string | null,
  authUserId: string
): NotificationAudienceContext {
  const viewAsRole = cookieStore.get(VIEW_AS_COOKIE_NAME)?.value?.trim() || null;
  const viewAsCoachId = cookieStore.get('levelup_view_as_coach_id')?.value?.trim() || null;
  return { authUserId, userRole, viewAsRole, viewAsCoachId };
}

/** Whose notification inbox to load (admin preview-as-coach reads that coach's row). */
export function resolveNotificationUserId(ctx: NotificationAudienceContext): string {
  if (ctx.userRole === 'admin' && ctx.viewAsRole === 'coach' && ctx.viewAsCoachId) {
    return ctx.viewAsCoachId;
  }
  return ctx.authUserId;
}

export function isCoachNotificationAudience(ctx: NotificationAudienceContext): boolean {
  if (ctx.userRole === 'coach') return true;
  return ctx.userRole === 'admin' && ctx.viewAsRole === 'coach';
}

export function filterNotificationsForAudience(
  rows: NotificationRow[],
  ctx: NotificationAudienceContext
): NotificationRow[] {
  if (!isCoachNotificationAudience(ctx)) return rows;
  return rows.filter((n) => COACH_NOTIFICATION_TYPES.has(n.type));
}
