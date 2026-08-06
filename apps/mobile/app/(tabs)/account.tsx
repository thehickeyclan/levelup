import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GuildLogo } from '@/components/guild-logo';
import { useAuth } from '@/lib/auth';
import { registerForPushNotifications } from '@/lib/push';
import { colors, typography } from '@/lib/theme';
import { useMobileCart } from '@/lib/mobile-cart';

export default function AccountScreen() {
  const {
    user,
    role,
    isCoachView,
    previewCoachView,
    setPreviewCoachView,
    previewParentView,
    setPreviewParentView,
    previewAthleteView,
    setPreviewAthleteView,
    selectedCoachName,
    signOut,
  } = useAuth();
  const router = useRouter();
  const { count: cartCount } = useMobileCart();
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <GuildLogo size={72} variant="mark" />
      <Text style={styles.kicker}>MORE</Text>
      <Text style={styles.heading}>Account & activity</Text>
      <Text style={styles.meta}>{user?.email}</Text>
      <Text style={styles.meta}>
        Role: {role ?? '…'}{previewAthleteView ? ' · previewing athlete' : previewParentView ? ' · previewing parent' : previewCoachView ? ' · previewing coach' : ''}
      </Text>
      {role === 'admin' && isCoachView ? (
        <Pressable style={styles.menuRow} onPress={() => router.push('/select-coach')}>
          <View>
            <Text style={styles.menuTitle}>Coach being previewed</Text>
            <Text style={styles.menuMeta}>{selectedCoachName ?? 'Choose a coach'}</Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </Pressable>
      ) : null}

      {!isCoachView ? (
        <>
          <Pressable style={styles.menuRow} onPress={() => router.push('/(tabs)/cart')}>
            <View>
              <Text style={styles.menuTitle}>Training Cart{cartCount > 0 ? ` (${cartCount})` : ''}</Text>
              <Text style={styles.menuMeta}>Review training spots and checkout</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
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
          <Pressable style={styles.menuRow} onPress={() => router.push('/my-wrestlers')}>
            <View><Text style={styles.menuTitle}>My wrestlers</Text><Text style={styles.menuMeta}>Add kids, photos, and profile details</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/activity')}>
            <View><Text style={styles.menuTitle}>Activity & photos</Text><Text style={styles.menuMeta}>See the feed and share session photos</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/my-coaches')}>
            <View><Text style={styles.menuTitle}>My coaches</Text><Text style={styles.menuMeta}>Coaches you follow and train with</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/wallet')}>
            <View><Text style={styles.menuTitle}>Wallet</Text><Text style={styles.menuMeta}>Credits and payment activity</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable style={styles.menuRow} onPress={() => router.push('/notifications')}>
        <View>
          <Text style={styles.menuTitle}>Alerts</Text>
          <Text style={styles.menuMeta}>Bookings and session updates</Text>
        </View>
        <Text style={styles.menuArrow}>›</Text>
      </Pressable>
      <Pressable style={styles.menuRow} onPress={() => router.push('/notification-settings')}>
        <View>
          <Text style={styles.menuTitle}>Notification settings</Text>
          <Text style={styles.menuMeta}>Choose app, push, and SMS alerts</Text>
        </View>
        <Text style={styles.menuArrow}>›</Text>
      </Pressable>

      {isCoachView ? (
        <>
          <Pressable style={styles.shareRow} onPress={() => router.push('/coach-share')}>
            <View style={styles.shareCopy}>
              <Text style={styles.shareEyebrow}>GET MORE BOOKINGS</Text>
              <Text style={styles.shareTitle}>Share my coaching page</Text>
              <Text style={styles.shareMeta}>QR + one link for your profile and every upcoming session</Text>
            </View>
            <Text style={styles.shareArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/coach-directory')}>
            <View><Text style={styles.menuTitle}>Coach Directory</Text><Text style={styles.menuMeta}>Profiles, referrals, messaging, and Coach Playbook</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/coach-athletes')}>
            <View><Text style={styles.menuTitle}>My Athletes</Text><Text style={styles.menuMeta}>History, weight, skill, milestones, and messaging</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/coach-playbook')}>
            <View><Text style={styles.menuTitle}>Coach Playbook</Text><Text style={styles.menuMeta}>Private 60-second tips from Guild coaches</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/coach-earnings')}>
            <View><Text style={styles.menuTitle}>Earnings</Text><Text style={styles.menuMeta}>Week, month, all time, and payouts</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/activity')}>
            <View><Text style={styles.menuTitle}>Activity</Text><Text style={styles.menuMeta}>Share photos and see Guild activity</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/coach-availability-custom')}>
            <View><Text style={styles.menuTitle}>Calendar & availability</Text><Text style={styles.menuMeta}>Keep at least one week open for families</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/coach-locations')}>
            <View><Text style={styles.menuTitle}>Training locations</Text><Text style={styles.menuMeta}>Add gyms, schools, and wrestling rooms</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => router.push('/coach-profile-edit')}>
            <View><Text style={styles.menuTitle}>Coach profile</Text><Text style={styles.menuMeta}>Photo, bio, schools, and training locations</Text></View>
            <Text style={styles.menuArrow}>›</Text>
          </Pressable>
        </>
      ) : null}

      {!isRealCoach ? (
        <>
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
          <Pressable
            style={previewAthleteView ? styles.button : styles.buttonSecondary}
            onPress={() => {
              const enteringAthleteView = !previewAthleteView;
              setPreviewAthleteView(enteringAthleteView);
              router.replace('/(tabs)');
            }}
          >
            <Text style={previewAthleteView ? styles.buttonText : styles.buttonSecondaryText}>
              {previewAthleteView ? 'Exit athlete preview' : 'Preview athlete view'}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable
            style={previewParentView ? styles.button : styles.buttonSecondary}
            onPress={() => {
              const enteringParentView = !previewParentView;
              setPreviewParentView(enteringParentView);
              router.replace('/(tabs)');
            }}
          >
            <Text style={previewParentView ? styles.buttonText : styles.buttonSecondaryText}>
              {previewParentView ? 'Exit parent preview' : 'Preview parent view'}
            </Text>
          </Pressable>
          <Pressable
            style={previewAthleteView ? styles.button : styles.buttonSecondary}
            onPress={() => {
              const enteringAthleteView = !previewAthleteView;
              setPreviewAthleteView(enteringAthleteView);
              router.replace('/(tabs)');
            }}
          >
            <Text style={previewAthleteView ? styles.buttonText : styles.buttonSecondaryText}>
              {previewAthleteView ? 'Exit athlete preview' : 'Preview athlete view'}
            </Text>
          </Pressable>
        </>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: 20, paddingBottom: 48, gap: 12, backgroundColor: colors.background },
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
  shareRow: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  shareCopy: { flex: 1, paddingRight: 12 },
  shareEyebrow: { ...typography.brand, color: colors.black, fontSize: 8 },
  shareTitle: { ...typography.bodyBold, color: colors.black, fontSize: 18, marginTop: 3 },
  shareMeta: { ...typography.body, color: colors.black, opacity: 0.75, fontSize: 12, marginTop: 3 },
  shareArrow: { ...typography.body, color: colors.black, fontSize: 34 },
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
