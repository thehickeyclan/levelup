import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerForPushNotifications } from '@/lib/push';
import { colors, typography } from '@/lib/theme';

type Preferences = {
  reminders_sms: boolean;
  reminders_push: boolean;
  confirmations_sms: boolean;
  confirmations_push: boolean;
  messaging_sms: boolean;
  messaging_push: boolean;
  followed_coaches_push: boolean;
  market_watch_push: boolean;
  nearby_coaches_push: boolean;
  sms_opted_out: boolean;
};

const DEFAULTS: Preferences = {
  reminders_sms: true,
  reminders_push: true,
  confirmations_sms: true,
  confirmations_push: true,
  messaging_sms: true,
  messaging_push: true,
  followed_coaches_push: true,
  market_watch_push: true,
  nearby_coaches_push: false,
  sms_opted_out: false,
};

type ToggleKey = Exclude<keyof Preferences, 'sms_opted_out'>;

function SettingRow({
  title,
  detail,
  value,
  disabled,
  onChange,
}: {
  title: string;
  detail: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowMeta}>{detail}</Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        trackColor={{ true: colors.accent }}
        onValueChange={onChange}
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const { role, isCoachView } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ToggleKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ preferences: Preferences; phone?: string | null }>(
        '/api/account/notification-preferences'
      );
      setPreferences({ ...DEFAULTS, ...data.preferences });
      setPhone(data.phone ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notification settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function toggle(key: ToggleKey, value: boolean) {
    const previous = preferences[key];
    setPreferences((current) => ({ ...current, [key]: value }));
    setSaving(key);
    setError(null);
    try {
      if (key.endsWith('_push') && value) {
        await registerForPushNotifications();
      }
      const data = await apiFetch<{ preferences: Preferences }>(
        '/api/account/notification-preferences',
        { method: 'PATCH', body: JSON.stringify({ [key]: value }) }
      );
      setPreferences({ ...DEFAULTS, ...data.preferences });
    } catch (e) {
      setPreferences((current) => ({ ...current, [key]: previous }));
      setError(e instanceof Error ? e.message : 'Could not save setting');
    } finally {
      setSaving(null);
    }
  }

  const isFamily = !isCoachView;
  const roleLabel = role === 'youth_wrestler' ? 'Athlete' : isCoachView ? 'Coach' : 'Parent';
  const smsDisabled = preferences.sms_opted_out || !phone;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <Text style={styles.kicker}>NOTIFICATIONS</Text>
      <Text style={styles.heading}>{roleLabel} alerts</Text>
      <Text style={styles.intro}>Choose how The Guild keeps you informed. Changes apply across web and iPhone.</Text>
      {loading ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 14 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.section}>MESSAGES</Text>
      <SettingRow title="Message push alerts" detail="New internal messages on this iPhone" value={preferences.messaging_push} disabled={saving !== null} onChange={(value) => void toggle('messaging_push', value)} />
      <SettingRow title="SMS backup alerts" detail={smsDisabled ? 'Add a phone number or re-enable SMS on the web' : 'Urgent/fallback Guild texts. Replies happen in the app.'} value={preferences.messaging_sms && !preferences.sms_opted_out} disabled={saving !== null || smsDisabled} onChange={(value) => void toggle('messaging_sms', value)} />

      <Text style={styles.section}>TRAINING</Text>
      <SettingRow title="Session reminder push" detail={isCoachView ? 'Reminders for sessions you coach' : 'Upcoming training reminders'} value={preferences.reminders_push} disabled={saving !== null} onChange={(value) => void toggle('reminders_push', value)} />
      <SettingRow title="Session reminder texts" detail={smsDisabled ? 'SMS is unavailable for this account' : 'Important reminders by text'} value={preferences.reminders_sms && !preferences.sms_opted_out} disabled={saving !== null || smsDisabled} onChange={(value) => void toggle('reminders_sms', value)} />
      <SettingRow title="Booking push alerts" detail={isCoachView ? 'New registrations and booking updates' : 'Confirmations and booking updates'} value={preferences.confirmations_push} disabled={saving !== null} onChange={(value) => void toggle('confirmations_push', value)} />
      <SettingRow title="Booking confirmation texts" detail={smsDisabled ? 'SMS is unavailable for this account' : 'Booking status by text'} value={preferences.confirmations_sms && !preferences.sms_opted_out} disabled={saving !== null || smsDisabled} onChange={(value) => void toggle('confirmations_sms', value)} />

      {isFamily ? (
        <>
          <Text style={styles.section}>DISCOVERY & MARKET</Text>
          <SettingRow title="Followed coaches" detail="New sessions and published availability" value={preferences.followed_coaches_push} disabled={saving !== null} onChange={(value) => void toggle('followed_coaches_push', value)} />
          <SettingRow title="Nearby coaches" detail="New coaches joining around your area" value={preferences.nearby_coaches_push} disabled={saving !== null} onChange={(value) => void toggle('nearby_coaches_push', value)} />
          <SettingRow title="Market watch list" detail="For sale, price drops, offers, sold, and traded" value={preferences.market_watch_push} disabled={saving !== null} onChange={(value) => void toggle('market_watch_push', value)} />
        </>
      ) : null}

      <Text style={styles.note}>You can also disable all Guild notifications in iPhone Settings. Reply STOP to any Guild text to disable SMS.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 50 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 29 },
  intro: { ...typography.body, color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 7 },
  section: { ...typography.brand, color: colors.accent, fontSize: 10, marginTop: 26, marginBottom: 4 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12, gap: 12 },
  rowText: { flex: 1 },
  rowTitle: { ...typography.bodySemi, color: colors.text, fontSize: 15 },
  rowMeta: { ...typography.body, color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  error: { ...typography.body, color: colors.danger, marginTop: 12 },
  note: { ...typography.body, color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 28 },
});
