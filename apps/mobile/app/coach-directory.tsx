import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fetchActiveCoaches, type MobileCoach } from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';

export default function CoachDirectoryScreen() {
  const router = useRouter();
  const { user, role, selectedCoachId } = useAuth();
  const [coaches, setCoaches] = useState<MobileCoach[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentCoachId = role === 'admin' ? selectedCoachId : role === 'coach' ? user?.id ?? null : null;

  const load = useCallback(async () => {
    setError(null);
    try {
      setCoaches(await fetchActiveCoaches());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load coaches');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return coaches.filter((coach) => {
      if (!coach.first_name?.trim() && !coach.last_name?.trim()) return false;
      if (!query) return true;
      return [coach.first_name, coach.last_name, coach.school]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [coaches, search]);

  async function messageCoach(coachId: string) {
    if (messagingId || coachId === currentCoachId) return;
    setMessagingId(coachId);
    setError(null);
    try {
      const data = await apiFetch<{ threadId: string }>('/api/guild/messages/coach-inquiry', {
        method: 'POST',
        body: JSON.stringify({ coachUserId: coachId }),
      });
      router.push(`/thread/${data.threadId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not message coach');
    } finally {
      setMessagingId(null);
    }
  }

  return (
    <FlatList
      style={styles.screen}
      data={visible}
      keyExtractor={(coach) => coach.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.kicker}>COACH COMMUNITY</Text>
          <Text style={styles.heading}>Coach Directory</Text>
          <Text style={styles.sub}>
            Connect, refer athletes, and learn from coaches across the Guild.
          </Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search coach or school"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      renderItem={({ item }) => {
        const isSelf = item.id === currentCoachId;
        return (
          <View style={styles.card}>
            <Pressable
              style={styles.identity}
              onPress={() => router.push(`/coach/${item.id}`)}
              accessibilityRole="link"
              accessibilityLabel={`View ${item.first_name} ${item.last_name}'s profile`}
            >
              {item.photo_url ? (
                <Image source={{ uri: item.photo_url }} style={styles.avatar} resizeMode="contain" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{item.first_name?.[0] ?? '?'}</Text>
                </View>
              )}
              <View style={styles.copy}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.first_name} {item.last_name}</Text>
                  {isSelf ? <Text style={styles.you}>YOU</Text> : null}
                </View>
                <Text style={styles.school}>{item.school ?? 'Guild coach'}</Text>
                <Text style={styles.rating}>
                  {item.review_count
                    ? `★ ${Number(item.average_rating ?? 0).toFixed(1)} · ${item.review_count} reviews`
                    : 'New coach'}
                </Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable style={styles.profileButton} onPress={() => router.push(`/coach/${item.id}`)}>
                <Text style={styles.profileButtonText}>View profile</Text>
              </Pressable>
              {!isSelf ? (
                <Pressable
                  style={styles.messageButton}
                  onPress={() => void messageCoach(item.id)}
                  disabled={messagingId !== null}
                >
                  <Text style={styles.messageButtonText}>
                    {messagingId === item.id ? 'Opening…' : 'Message'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable style={styles.messageButton} onPress={() => router.push('/coach-profile-edit')}>
                  <Text style={styles.messageButtonText}>Edit profile</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      }}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : (
          <Text style={styles.empty}>
            {search.trim() ? 'No coaches match that search.' : 'No active coaches found.'}
          </Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 52 },
  header: { marginBottom: 10 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10 },
  heading: { ...typography.display, color: colors.text, fontSize: 34, marginTop: 6 },
  sub: { ...typography.body, color: colors.textSecondary, lineHeight: 20, marginTop: 6 },
  search: {
    ...typography.body,
    color: colors.text,
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 5,
    backgroundColor: colors.surface,
    marginTop: 16,
  },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginTop: 10 },
  card: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 16,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.black },
  avatarFallback: {
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { ...typography.bodyBold, color: colors.accent, fontSize: 20 },
  copy: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...typography.bodyBold, color: colors.text, fontSize: 17, flexShrink: 1 },
  you: {
    ...typography.bodyBold,
    color: colors.black,
    backgroundColor: colors.accent,
    fontSize: 7,
    letterSpacing: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  school: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  rating: { ...typography.body, color: colors.accent, fontSize: 11, marginTop: 5 },
  arrow: { ...typography.body, color: colors.accent, fontSize: 28 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  profileButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  profileButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 12 },
  messageButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
  },
  messageButtonText: { ...typography.bodyBold, color: colors.accent, fontSize: 12 },
  loading: { marginTop: 36 },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: 36 },
});
