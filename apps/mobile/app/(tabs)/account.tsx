import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GuildLogo } from '@/components/guild-logo';
import { useAuth } from '@/lib/auth';
import { registerForPushNotifications } from '@/lib/push';
import { colors, typography } from '@/lib/theme';
import { apiFetch } from '@/lib/api';

export default function AccountScreen() {
  const {
    user,
    role,
    isCoachView,
    previewCoachView,
    setPreviewCoachView,
    previewParentView,
    setPreviewParentView,
    signOut,
  } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [nearbyCoachAlerts, setNearbyCoachAlerts] = useState(false);
  const [savingNearby, setSavingNearby] = useState(false);

  const isRealCoach = role === 'coach' || role === 'admin';

  useEffect(() => {
    if (isCoachView) return;
    void apiFetch<{ preferences?: { nearby_coaches_push?: boolean } }>(
      '/api/account/notification-preferences'
    )
      .then((data) => setNearbyCoachAlerts(data.preferences?.nearby_coaches_push === true))
      .catch(() => undefined);
  }, [isCoachView]);

  async function onToggleNearby(value: boolean) {
    const previous = nearbyCoachAlerts;
    setNearbyCoachAlerts(value);
    setSavingNearby(true);
    try {
      await apiFetch('/api/account/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify({ nearby_coaches_push: value }),
      });
      if (value) await registerForPushNotifications();
    } catch {
      setNearbyCoachAlerts(previous);
    } finally {
      setSavingNearby(false);
    }
  }

  async function onEnablePush() {
    setBusy(true);
    setPushMsg(null);
    try {
      const token = await registerForPushNotifications();
      setPushMsg(token ? 'Push alerts enabled.' : 'Permission not granted (simulator or denied).');
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : 'Could not enable push');
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    try {
      await signOut();
      router.replace('/(auth)/login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <GuildLogo size={72} variant="mark" />
      <Text style={styles.kicker}>MORE</Text>
      <Text style={styles.heading}>Account & activity</Text>
      <Text style={styles.meta}>{user?.email}</Text>
      <Text style={styles.meta}>Role: {role ?? '…'}</Text>

      {!isCoachView ? (
        <Pressable
          style={styles.menuRow}
          onPress={() => router.push({ pathname: '/(tabs)/bookings', params: { view: 'past' } })}
        >
          <View>
            <Text style={styles.menuTitle}>Training history</Text>
            <Text style={styles.menuMeta}>Past sessions and reviews</Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.menuRow} onPress={() => router.push('/notifications')}>
        <View>
          <Text style={styles.menuTitle}>Alerts</Text>
          <Text style={styles.menuMeta}>Bookings and session updates</Text>
        </View>
        <Text style={styles.menuArrow}>›</Text>
      </Pressable>

      {!isCoachView ? (
        <View style={styles.menuRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Nearby coach alerts</Text>
            <Text style={styles.menuMeta}>New coaches within about 50 miles of your ZIP</Text>
          </View>
          <Switch
            value={nearbyCoachAlerts}
            disabled={savingNearby}
            trackColor={{ true: colors.accent }}
            onValueChange={(value) => void onToggleNearby(value)}
          />
        </View>
      ) : null}

      {!isRealCoach ? (
        <Pressable
          style={previewCoachView ? styles.button : styles.buttonSecondary}
          onPress={() => {
            setPreviewCoachView(!previewCoachView);
            router.replace('/(tabs)');
          }}
        >
          <Text style={previewCoachView ? styles.buttonText : styles.buttonSecondaryText}>
            {previewCoachView ? 'Exit coach preview' : 'Preview coach view'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          style={previewParentView ? styles.button : styles.buttonSecondary}
          onPress={() => {
            const enteringParentView = !previewParentView;
            setPreviewParentView(enteringParentView);
            router.replace(enteringParentView ? '/(tabs)/find' : '/(tabs)');
          }}
        >
          <Text style={previewParentView ? styles.buttonText : styles.buttonSecondaryText}>
            {previewParentView ? 'Exit parent preview' : 'Preview parent view'}
          </Text>
        </Pressable>
      )}

      <Pressable style={styles.buttonSecondary} onPress={() => void onEnablePush()} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.buttonSecondaryText}>Enable push alerts</Text>
        )}
      </Pressable>
      {pushMsg ? <Text style={styles.meta}>{pushMsg}</Text> : null}

      <Pressable style={styles.danger} onPress={() => void onSignOut()} disabled={busy}>
        <Text style={styles.dangerText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12, backgroundColor: colors.background },
  kicker: { ...typography.brand, fontSize: 11, color: colors.accent, marginTop: 8 },
  heading: { ...typography.display, fontSize: 28, color: colors.text },
  meta: { ...typography.body, color: colors.textSecondary, fontSize: 14 },
  menuRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
  },
  menuTitle: { ...typography.bodySemi, color: colors.text, fontSize: 15 },
  menuMeta: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  menuArrow: { ...typography.body, color: colors.accent, fontSize: 26 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonText: { ...typography.bodyBold, color: colors.black },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonSecondaryText: { ...typography.bodyBold, color: colors.accent },
  danger: {
    marginTop: 24,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { ...typography.bodyBold, color: colors.danger },
});
