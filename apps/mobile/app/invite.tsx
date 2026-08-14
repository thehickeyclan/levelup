import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type ReferralData = {
  rewardsEnabled: boolean;
  referralCode: string | null;
  referralLink: string | null;
  completedReferrals: number;
  referralAwaitingFirstBooking: number;
  referralCreditOnHold: number;
  nextReferralCreditAvailableAt: string | null;
  referralCreditAmountDefault: number;
};

export default function InviteScreen() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiFetch<ReferralData>('/api/referrals/me'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your invite link');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const amount = data?.referralCreditAmountDefault ?? 25;
  const link = data?.referralLink;

  const shareLink = useCallback(async () => {
    if (!link) return;
    await Share.share({
      message: `My kid trains with Division I wrestlers through The Guild — small groups and privates near us. Join with my link and get $${amount} toward your first session: ${link}`,
    });
  }, [link]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <Text style={styles.kicker}>INVITE & EARN</Text>
      <Text style={styles.heading}>Give ${amount}, get ${amount}</Text>
      <Text style={styles.sub}>
        Share your link with another wrestling family. They get ${amount} toward their first
        session the moment they join — and when they book, you get ${amount} in training
        credits, applied automatically at checkout.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !data ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}

      {data?.rewardsEnabled === false ? (
        <Text style={styles.error}>The rewards program is not available right now.</Text>
      ) : null}

      {link ? (
        <>
          <View style={styles.linkCard}>
            <Text style={styles.linkLabel}>YOUR INVITE LINK</Text>
            <Text style={styles.linkText} numberOfLines={2}>{link}</Text>
          </View>

          <Pressable style={styles.shareButton} onPress={() => void shareLink()} accessibilityRole="button">
            <Text style={styles.shareButtonText}>Share your link</Text>
          </Pressable>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{data?.referralAwaitingFirstBooking ?? 0}</Text>
              <Text style={styles.statLabel}>Joined, not booked yet</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{data?.referralCreditOnHold ?? 0}</Text>
              <Text style={styles.statLabel}>Credit on the way</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{data?.completedReferrals ?? 0}</Text>
              <Text style={styles.statLabel}>Families earned</Text>
            </View>
          </View>

          <View style={styles.howCard}>
            <Text style={styles.howTitle}>How it works</Text>
            <Text style={styles.howStep}>
              1. Send your link to a wrestling family — they get ${amount} toward their first session
              just for joining with it.
            </Text>
            <Text style={styles.howStep}>2. They book any session — small group, private, or partner.</Text>
            <Text style={styles.howStep}>
              3. ${amount} in credits lands in your wallet a few days after their first session is paid.
            </Text>
            <Text style={styles.howNote}>Credits apply to training only, not the Guild Market.</Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 30, marginTop: 6, marginBottom: 8 },
  sub: { ...typography.body, color: colors.textSecondary, fontSize: 14, marginBottom: 20, lineHeight: 21 },
  error: { ...typography.body, color: '#e5484d', marginBottom: 12 },
  linkCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
  },
  linkLabel: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 6 },
  linkText: { ...typography.bodySemi, color: colors.text, fontSize: 14 },
  shareButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 22,
  },
  shareButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: { ...typography.display, color: colors.accent, fontSize: 24 },
  statLabel: { ...typography.body, color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 4 },
  howCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  howTitle: { ...typography.bodyBold, color: colors.text, fontSize: 16, marginBottom: 8 },
  howStep: { ...typography.body, color: colors.textSecondary, fontSize: 13, marginBottom: 6, lineHeight: 20 },
  howNote: { ...typography.body, color: colors.textSecondary, fontSize: 11, marginTop: 8, fontStyle: 'italic' },
});
