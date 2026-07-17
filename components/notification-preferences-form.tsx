'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/lib/notification-preferences';

type Props = {
  initialPreferences?: NotificationPreferences;
  initialPhone?: string | null;
};

export function NotificationPreferencesForm({
  initialPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
  initialPhone = null,
}: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(initialPreferences);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [reEnabling, setReEnabling] = useState(false);

  const patchPref = useCallback(async (key: keyof NotificationPreferences, value: boolean) => {
    setSavingKey(key);
    const prev = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      const res = await fetch('/api/account/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        setPrefs(prev);
        return;
      }
      const data = (await res.json()) as { preferences?: NotificationPreferences };
      if (data.preferences) setPrefs(data.preferences);
    } catch {
      setPrefs(prev);
    } finally {
      setSavingKey(null);
    }
  }, [prefs]);

  const reEnableSms = async () => {
    setReEnabling(true);
    try {
      const res = await fetch('/api/account/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ re_enable_sms: true }),
      });
      if (res.ok) {
        const data = (await res.json()) as { preferences?: NotificationPreferences };
        if (data.preferences) setPrefs(data.preferences);
      }
    } finally {
      setReEnabling(false);
    }
  };

  const row = (
    label: string,
    key: keyof NotificationPreferences,
    disabled = false
  ) => (
    <div
      key={key}
      className="flex items-center justify-between gap-4 min-h-[44px] py-2 px-4"
    >
      <span className="text-sm text-foreground flex-1">{label}</span>
      <Switch
        checked={prefs[key]}
        disabled={disabled || savingKey === key}
        onCheckedChange={(v) => void patchPref(key, v)}
        aria-label={label}
      />
    </div>
  );

  const hasPhone = Boolean(initialPhone?.replace(/\D/g, '').length);

  return (
    <div className="space-y-3">
      {prefs.sms_opted_out && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="text-foreground mb-2">
            You opted out of SMS alerts (reply STOP to any Guild text).
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            disabled={reEnabling}
            onClick={() => void reEnableSms()}
          >
            {reEnabling ? 'Re-enabling…' : 'Re-enable SMS alerts'}
          </Button>
        </div>
      )}

      {!hasPhone && (
        <p className="text-xs text-muted-foreground px-1">
          Add your cell on{' '}
          <Link href="/account" className="text-accent underline min-h-[44px] inline-flex items-center">
            Account
          </Link>{' '}
          to receive text alerts.
        </p>
      )}

      <div>
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 px-1">
          Text alerts (SMS)
        </h2>
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden divide-y divide-zinc-800/50">
          {row('New sessions from coaches I follow', 'new_sessions_sms', prefs.sms_opted_out)}
          {row('Session reminders (24 hours before)', 'reminders_sms', prefs.sms_opted_out)}
          {row('Booking confirmations', 'confirmations_sms', prefs.sms_opted_out)}
          {row('Messages sent to me by SMS', 'messaging_sms', prefs.sms_opted_out)}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 px-1">
          Push notifications
        </h2>
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden divide-y divide-zinc-800/50">
          {row('New sessions from coaches I follow', 'new_sessions_push')}
          {row('Session reminders', 'reminders_push')}
          {row('Booking confirmations', 'confirmations_push')}
          {row('New Guild messages', 'messaging_push')}
        </div>
      </div>
    </div>
  );
}
