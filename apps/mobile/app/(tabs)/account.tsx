import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GuildLogo } from '@/components/guild-logo';
import { useAuth } from '@/lib/auth';
import { registerForPushNotifications } from '@/lib/push';
import { colors, typography } from '@/lib/theme';

export default function AccountScreen() {
  const { user, role, previewCoachView, setPreviewCoachView, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const isRealCoach = role === 'coach' || role === 'admin';

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
      <Text style={styles.kicker}>ACCOUNT</Text>
      <Text style={styles.heading}>You</Text>
      <Text style={styles.meta}>{user?.email}</Text>
      <Text style={styles.meta}>Role: {role ?? '…'}</Text>

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
      ) : null}

      <Pressable style={styles.button} onPress={() => router.push('/notifications')}>
        <Text style={styles.buttonText}>View alerts</Text>
      </Pressable>
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
