import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type Follow = {
  coachId: string;
  followedAt: string;
  coach: {
    id: string;
    firstName: string;
    lastName: string;
    school: string;
    photoUrl?: string;
    averageRating?: number | null;
    reviewCount?: number | null;
  } | null;
};

export default function MyCoachesScreen() {
  const router = useRouter();
  const [follows, setFollows] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setFollows((await apiFetch<{ follows: Follow[] }>('/api/coach-follows')).follows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load coaches');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function message(coachId: string) {
    try {
      const result = await apiFetch<{ threadId: string }>('/api/guild/messages/coach-inquiry', {
        method: 'POST',
        body: JSON.stringify({ coachId }),
      });
      router.push(`/thread/${result.threadId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start message');
    }
  }

  async function unfollow(coachId: string) {
    await apiFetch(`/api/coach-follows?coachId=${encodeURIComponent(coachId)}`, { method: 'DELETE' });
    setFollows((current) => current.filter((item) => item.coachId !== coachId));
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <Text style={styles.kicker}>TRAINING</Text>
      <Text style={styles.heading}>My coaches</Text>
      <Text style={styles.sub}>Coaches you follow and want to train with.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && follows.length === 0 ? <ActivityIndicator color={colors.accent} /> : null}
      {follows.map(({ coachId, coach }) => coach ? (
        <View key={coachId} style={styles.card}>
          <Pressable style={styles.identity} onPress={() => router.push(`/coach/${coachId}`)}>
            {coach.photoUrl ? (
              <Image source={{ uri: coach.photoUrl }} style={styles.avatar} resizeMode="contain" />
            ) : (
              <View style={styles.avatar} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{coach.firstName} {coach.lastName}</Text>
              <Text style={styles.meta}>{coach.school}</Text>
              <Text style={styles.rating}>{coach.reviewCount ? `★ ${Number(coach.averageRating ?? 0).toFixed(1)} · ${coach.reviewCount} reviews` : 'New coach'}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable style={styles.primary} onPress={() => void message(coachId)}><Text style={styles.primaryText}>Message</Text></Pressable>
            <Pressable style={styles.secondary} onPress={() => void unfollow(coachId)}><Text style={styles.secondaryText}>Unfollow</Text></Pressable>
          </View>
        </View>
      ) : null)}
      {!loading && follows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No followed coaches yet</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/(tabs)/find?tab=request')}><Text style={styles.primaryText}>Browse coaches</Text></Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 34, marginTop: 6 },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 6, marginBottom: 14 },
  card: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 16 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.black },
  name: { ...typography.bodyBold, color: colors.text, fontSize: 17 },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
  rating: { ...typography.body, color: colors.accent, fontSize: 12, marginTop: 4 },
  arrow: { color: colors.accent, fontSize: 28 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primary: { flex: 1, minHeight: 42, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  primaryText: { ...typography.bodyBold, color: colors.black },
  secondary: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  secondaryText: { ...typography.bodyBold, color: colors.textSecondary },
  empty: { marginTop: 30, gap: 18 },
  emptyTitle: { ...typography.bodySemi, color: colors.textSecondary, textAlign: 'center' },
  error: { ...typography.body, color: colors.danger, marginVertical: 10 },
});
