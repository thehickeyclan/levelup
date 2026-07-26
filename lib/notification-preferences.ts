export type NotificationPreferences = {
  new_sessions_sms: boolean;
  reminders_sms: boolean;
  confirmations_sms: boolean;
  new_sessions_push: boolean;
  reminders_push: boolean;
  confirmations_push: boolean;
  messaging_sms: boolean;
  messaging_push: boolean;
  nearby_coaches_push: boolean;
  followed_coaches_push: boolean;
  training_partner_activity_push: boolean;
  matching_sessions_push: boolean;
  market_watch_push: boolean;
  sms_opted_out: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  new_sessions_sms: true,
  reminders_sms: true,
  confirmations_sms: true,
  new_sessions_push: true,
  reminders_push: true,
  confirmations_push: true,
  messaging_sms: true,
  messaging_push: true,
  nearby_coaches_push: false,
  followed_coaches_push: true,
  training_partner_activity_push: false,
  matching_sessions_push: true,
  market_watch_push: true,
  sms_opted_out: false,
};

const BOOL_KEYS: (keyof NotificationPreferences)[] = [
  'new_sessions_sms',
  'reminders_sms',
  'confirmations_sms',
  'new_sessions_push',
  'reminders_push',
  'confirmations_push',
  'messaging_sms',
  'messaging_push',
  'nearby_coaches_push',
  'followed_coaches_push',
  'training_partner_activity_push',
  'matching_sessions_push',
  'market_watch_push',
  'sms_opted_out',
];

/** Merge stored JSON with defaults; unknown keys are ignored. */
export function parseNotificationPreferences(raw: unknown): NotificationPreferences {
  const base = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  for (const key of BOOL_KEYS) {
    if (typeof o[key] === 'boolean') {
      base[key] = o[key];
    }
  }
  return base;
}

/** Patch only boolean preference keys from a partial update. */
export function patchNotificationPreferences(
  current: NotificationPreferences,
  patch: Partial<NotificationPreferences>,
): NotificationPreferences {
  const next = { ...current };
  for (const key of BOOL_KEYS) {
    if (typeof patch[key] === 'boolean') {
      next[key] = patch[key]!;
    }
  }
  return next;
}

export function wantsNewSessionSms(prefs: NotificationPreferences): boolean {
  return prefs.new_sessions_sms && !prefs.sms_opted_out;
}

export function wantsNewSessionPush(prefs: NotificationPreferences): boolean {
  return prefs.new_sessions_push;
}
