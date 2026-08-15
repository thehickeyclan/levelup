import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GuildLogo } from '@/components/guild-logo';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerForPushNotifications } from '@/lib/push';
import { colors, typography } from '@/lib/theme';
import { useMobileCart } from '@/lib/mobile-cart';

type IconName = keyof typeof Ionicons.glyphMap;

/** Ocean-style grouped settings: section label above a rounded card of rows. */
function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Row({
  icon,
  title,
  meta,
  onPress,
  last = false,
  destructive = false,
  loading = false,
  chevron = true,
}: {
  icon: IconName;
  title: string;
  meta?: string;
  onPress: () => void;
  last?: boolean;
  destructive?: boolean;
  loading?: boolean;
  chevron?: boolean;
}) {
  return (
    <Pressable style={[styles.row, !last && styles.rowDivider]} onPress={onPress} disabled={loading}>
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? colors.danger : colors.accent}
        style={styles.rowIcon}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, destructive && { color: colors.danger }]}>{title}</Text>
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : chevron ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      ) : null}
    </Pressable>
  );
}

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
  const [sharingInvite, setSharingInvite] = useState(false);

  const shareInviteLink = async () => {
    if (sharingInvite) return;
    setSharingInvite(true);
    try {
      const me = await apiFetch<{ referralLink: string | null }>('/api/referrals/me');
      if (!me.referralLink) throw new Error('No invite link yet');
      await Share.share({
        message: `We train with current and former NCAA athletes and elite coaches through The Guild — small groups and privates near us. Join with my link and get $10 toward your first session: ${me.referralLink}`,
      });
    } catch {
      Alert.alert('Invite link unavailable', 'Please try again in a moment.');
    } finally {
      setSharingInvite(false);
    }
  };

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

  function onDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'Your account is locked immediately and your personal data is removed within 30 days. Order and booking history that involves other families is retained. This cannot be undone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await apiFetch('/api/mobile/account/delete', { method: 'POST' });
                await signOut();
                router.replace('/(auth)/login');
              } catch (e) {
                setPushMsg(e instanceof Error ? e.message : 'Could not delete the account — try again.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <GuildLogo size={64} variant="mark" />
        <Text style={styles.heading}>Account</Text>
        <Text style={styles.meta}>{user?.email}</Text>
        <Text style={styles.metaSmall}>
          {role ?? '…'}
          {previewAthleteView ? ' · previewing athlete' : previewParentView ? ' · previewing parent' : previewCoachView ? ' · previewing coach' : ''}
        </Text>
      </View>

      {role === 'admin' && isCoachView ? (
        <Group>
          <Row
            icon="swap-horizontal-outline"
            title="Coach being previewed"
            meta={selectedCoachName ?? 'Choose a coach'}
            onPress={() => router.push('/select-coach')}
            last
          />
        </Group>
      ) : null}

      {!isCoachView ? (
        <>
          <SectionLabel>REFER & EARN</SectionLabel>
          <Pressable style={styles.referCardFilled} onPress={() => router.push('/invite')}>
            <Ionicons name="gift-outline" size={26} color={colors.black} />
            <View style={{ flex: 1 }}>
              <Text style={styles.referFilledTitle}>GIVE $10, GET $10</Text>
              <Text style={styles.referFilledMeta}>
                They get $10 toward their first session — you get $10 in training credits when they book
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.referCardOutline}
            onPress={() => void shareInviteLink()}
            disabled={sharingInvite}
          >
            <Ionicons name="paper-plane-outline" size={24} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.referOutlineTitle}>SHARE YOUR INVITE LINK</Text>
              <Text style={styles.referOutlineMeta}>
                {sharingInvite ? 'Opening…' : 'Text it to your wrestling community'}
              </Text>
            </View>
          </Pressable>

          <SectionLabel>TRAINING</SectionLabel>
          <Group>
            <Row
              icon="cart-outline"
              title={`Training Cart${cartCount > 0 ? ` (${cartCount})` : ''}`}
              meta="Review training spots and checkout"
              onPress={() => router.push('/(tabs)/cart')}
            />
            <Row
              icon="time-outline"
              title="Training history"
              meta="Past sessions and reviews"
              onPress={() => router.push({ pathname: '/(tabs)/bookings', params: { view: 'past' } })}
            />
            <Row
              icon="people-outline"
              title="My wrestlers"
              meta="Add kids, photos, and profile details"
              onPress={() => router.push('/my-wrestlers')}
            />
            <Row
              icon="school-outline"
              title="My coaches"
              meta="Coaches you follow and train with"
              onPress={() => router.push('/my-coaches')}
            />
            <Row
              icon="images-outline"
              title="Activity & photos"
              meta="See the feed and share session photos"
              onPress={() => router.push('/activity')}
              last
            />
          </Group>

          <SectionLabel>PAYMENTS AND BILLING</SectionLabel>
          <Group>
            <Row
              icon="wallet-outline"
              title="Wallet"
              meta="Credits and payment activity"
              onPress={() => router.push('/wallet')}
              last
            />
          </Group>
        </>
      ) : null}

      {isCoachView ? (
        <>
          <Pressable style={styles.shareRow} onPress={() => router.push('/coach-share')}>
            <View style={styles.shareCopy}>
              <Text style={styles.shareEyebrow}>GET MORE BOOKINGS</Text>
              <Text style={styles.shareTitle}>Share my coaching page</Text>
              <Text style={styles.shareMeta}>QR + one link for your profile and every upcoming session</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.black} />
          </Pressable>

          <SectionLabel>COACHING</SectionLabel>
          <Group>
            <Row
              icon="people-outline"
              title="Coach Directory"
              meta="Profiles, referrals, messaging, and Coach Playbook"
              onPress={() => router.push('/coach-directory')}
            />
            <Row
              icon="body-outline"
              title="My Athletes"
              meta="History, weight, skill, milestones, and messaging"
              onPress={() => router.push('/coach-athletes')}
            />
            <Row
              icon="book-outline"
              title="Coach Playbook"
              meta="Private 60-second tips from Guild coaches"
              onPress={() => router.push('/coach-playbook')}
            />
            <Row
              icon="cash-outline"
              title="Earnings"
              meta="Week, month, all time, and payouts"
              onPress={() => router.push('/coach-earnings')}
            />
            <Row
              icon="images-outline"
              title="Activity"
              meta="Share photos and see Guild activity"
              onPress={() => router.push('/activity')}
              last
            />
          </Group>

          <SectionLabel>SCHEDULE AND PROFILE</SectionLabel>
          <Group>
            <Row
              icon="calendar-outline"
              title="Calendar & availability"
              meta="Keep at least one week open for families"
              onPress={() => router.push('/coach-availability-custom')}
            />
            <Row
              icon="location-outline"
              title="Training locations"
              meta="Add gyms, schools, and wrestling rooms"
              onPress={() => router.push('/coach-locations')}
            />
            <Row
              icon="person-circle-outline"
              title="Coach profile"
              meta="Photo, bio, schools, and training locations"
              onPress={() => router.push('/coach-profile-edit')}
              last
            />
          </Group>
        </>
      ) : null}

      <SectionLabel>PREFERENCES AND NOTIFICATIONS</SectionLabel>
      <Group>
        <Row
          icon="notifications-outline"
          title="Alerts"
          meta="Bookings and session updates"
          onPress={() => router.push('/notifications')}
        />
        <Row
          icon="options-outline"
          title="Notification settings"
          meta="Choose app, push, and SMS alerts"
          onPress={() => router.push('/notification-settings')}
        />
        <Row
          icon="phone-portrait-outline"
          title="Enable push alerts"
          meta={pushMsg ?? 'Turn on booking and message notifications'}
          onPress={() => void onEnablePush()}
          loading={busy}
          chevron={false}
          last
        />
      </Group>

      <SectionLabel>VIEW AS</SectionLabel>
      <Group>
        {!isRealCoach ? (
          <Row
            icon="swap-horizontal-outline"
            title={previewCoachView ? 'Exit coach preview' : 'Preview coach view'}
            onPress={() => {
              setPreviewCoachView(!previewCoachView);
              router.replace('/(tabs)');
            }}
          />
        ) : (
          <Row
            icon="swap-horizontal-outline"
            title={previewParentView ? 'Exit parent preview' : 'Preview parent view'}
            onPress={() => {
              setPreviewParentView(!previewParentView);
              router.replace('/(tabs)');
            }}
          />
        )}
        <Row
          icon="swap-vertical-outline"
          title={previewAthleteView ? 'Exit athlete preview' : 'Preview athlete view'}
          onPress={() => {
            setPreviewAthleteView(!previewAthleteView);
            router.replace('/(tabs)');
          }}
          last
        />
      </Group>

      <SectionLabel>ACCOUNT</SectionLabel>
      <Group>
        <Row
          icon="log-out-outline"
          title="Sign out"
          onPress={() => void onSignOut()}
          loading={busy}
          chevron={false}
          destructive
        />
        <Row
          icon="trash-outline"
          title="Delete account"
          meta="Permanently remove account and data"
          onPress={onDeleteAccount}
          chevron={false}
          destructive
          last
        />
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: 20, paddingBottom: 48, backgroundColor: colors.background },
  header: { alignItems: 'center', marginBottom: 6 },
  heading: { ...typography.display, fontSize: 30, color: colors.text, marginTop: 10 },
  meta: { ...typography.body, color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  metaSmall: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  sectionLabel: {
    ...typography.brand,
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 1.6,
    marginTop: 24,
    marginBottom: 8,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 24, textAlign: 'center' },
  rowTitle: { ...typography.bodySemi, color: colors.text, fontSize: 15 },
  rowMeta: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  referCardFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  referFilledTitle: { ...typography.bodyBold, color: colors.black, fontSize: 15, letterSpacing: 0.5 },
  referFilledMeta: { ...typography.body, color: colors.black, fontSize: 12, marginTop: 3, opacity: 0.75 },
  referCardOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    alignSelf: 'stretch',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  referOutlineTitle: { ...typography.bodyBold, color: colors.text, fontSize: 14, letterSpacing: 0.5 },
  referOutlineMeta: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  shareRow: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 18,
  },
  shareCopy: { flex: 1, paddingRight: 12 },
  shareEyebrow: { ...typography.brand, color: colors.black, fontSize: 8 },
  shareTitle: { ...typography.bodyBold, color: colors.black, fontSize: 18, marginTop: 3 },
  shareMeta: { ...typography.body, color: colors.black, opacity: 0.75, fontSize: 12, marginTop: 3 },
});
