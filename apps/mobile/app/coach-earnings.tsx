import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';
import { useAuth } from '@/lib/auth';

type Earnings = {
  thisWeek: number;
  thisMonth: number;
  allTime: number;
  pending: number;
  pendingSessions: number;
};
type LeaderboardRow = {
  id: string;
  sessionRank: number;
  earningsRank: number;
  ratingRank: number | null;
  totalEarningsUsd: number;
  isOnFire: boolean;
};

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export default function CoachEarningsScreen() {
  const { selectedCoachName } = useAuth();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [rank, setRank] = useState<LeaderboardRow | null>(null);
  const [totalCoaches, setTotalCoaches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, leaderboard] = await Promise.all([
        apiFetch<{ coachId: string; earnings: Earnings }>('/api/mobile/coach/overview'),
        apiFetch<{ leaderboard: LeaderboardRow[]; totalCoaches: number }>('/api/coach/leaderboard'),
      ]);
      setEarnings(data.earnings);
      setRank(leaderboard.leaderboard.find((row) => row.id === data.coachId) ?? null);
      setTotalCoaches(leaderboard.totalCoaches);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load earnings');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <Text style={styles.kicker}>COACH</Text>
      <Text style={styles.heading}>Earnings</Text>
      <Text style={styles.intro}>
        {selectedCoachName ? `${selectedCoachName}'s` : 'Your'} completed-session earnings and payout status.
      </Text>
      {loading && !earnings ? <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {earnings ? (
        <>
          <View style={styles.grid}>
            <View style={styles.card}><Text style={styles.label}>THIS WEEK</Text><Text style={styles.value}>{money(earnings.thisWeek)}</Text></View>
            <View style={styles.card}><Text style={styles.label}>THIS MONTH</Text><Text style={styles.value}>{money(earnings.thisMonth)}</Text></View>
            <View style={styles.card}><Text style={styles.label}>ALL TIME</Text><Text style={styles.value}>{money(earnings.allTime)}</Text></View>
          </View>
          <View style={styles.pending}>
            <Text style={styles.pendingTitle}>Pending payout</Text>
            <Text style={styles.pendingValue}>{money(earnings.pending)}</Text>
            <Text style={styles.pendingMeta}>{earnings.pendingSessions} completed session{earnings.pendingSessions === 1 ? '' : 's'}</Text>
          </View>
          {rank ? (
            <View style={styles.leaderboard}>
              <Text style={styles.pendingTitle}>Guild leaderboard</Text>
              <Text style={styles.rank}>#{rank.earningsRank} <Text style={styles.rankOf}>of {totalCoaches} in earnings</Text></Text>
              <Text style={styles.rankMeta}>
                Sessions #{rank.sessionRank}
                {rank.ratingRank ? ` · Rating #${rank.ratingRank}` : ''}
                {rank.isOnFire ? ' · On a roll this month' : ''}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 30 },
  intro: { ...typography.body, color: colors.textMuted, marginTop: 6, marginBottom: 18 },
  error: { ...typography.body, color: colors.danger, marginTop: 16 },
  grid: { gap: 10 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 18, borderRadius: 4 },
  label: { ...typography.brand, color: colors.accent, fontSize: 10 },
  value: { ...typography.display, color: colors.text, fontSize: 30, marginTop: 6 },
  pending: { marginTop: 18, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  pendingTitle: { ...typography.bodySemi, color: colors.text, fontSize: 16 },
  pendingValue: { ...typography.display, color: colors.accent, fontSize: 26, marginTop: 5 },
  pendingMeta: { ...typography.body, color: colors.textMuted, marginTop: 3 },
  leaderboard: { marginTop: 18, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rank: { ...typography.display, color: colors.accent, fontSize: 30, marginTop: 8 },
  rankOf: { ...typography.bodySemi, color: colors.text, fontSize: 15 },
  rankMeta: { ...typography.body, color: colors.textMuted, marginTop: 5 },
});
