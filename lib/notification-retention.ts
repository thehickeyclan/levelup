/** In-app notifications older than this are purged by cron and hidden from feeds. */
export const NOTIFICATION_RETENTION_DAYS = 30;

export function notificationRetentionCutoff(now = Date.now()): string {
  return new Date(now - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
