import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  fetchOpenSmallGroupSessions,
  type OpenSmallGroupSession,
} from '@/lib/parent-data';
import { useMobileCart } from '@/lib/mobile-cart';
import { colors, typography } from '@/lib/theme';
import { MIN_TOUCH_TARGET } from '@/lib/accessibility';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPrice(session: OpenSmallGroupSession) {
  const cents =
    session.price_per_participant != null
      ? Math.round(Number(session.price_per_participant) * 100)
      : session.total_price != null
        ? Math.round(Number(session.total_price) * 100)
        : null;
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(0)}/athlete`;
}

export default function CoachSmallGroupsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const coachId = Array.isArray(id) ? id[0] : id;
  const { addSession, sessionLineCount } = useMobileCart();
  const [sessions, setSessions] = useState<OpenSmallGroupSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingSessionId, setAddingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!coachId) return;
    setError(null);
    try {
      const groups = await fetchOpenSmallGroupSessions();
      setSessions(groups.filter((session) => session.athlete_id === coachId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load small groups');
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const coach = useMemo(() => sessions.find((session) => session.coach)?.coach ?? null, [sessions]);
  const coachName = coach ? `${coach.first_name} ${coach.last_name}`.trim() : 'This coach';

  async function addTrainingToCart(sessionId: string) {
    if (addingSessionId) return;
    setAddingSessionId(sessionId);
    setError(null);
    try {
      await addSession(sessionId);
      router.push('/(tabs)/cart');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add training to cart');
    } finally {
      setAddingSessionId(null);
    }
  }

  if (loading && sessions.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>SMALL GROUPS</Text>
        <Text style={styles.title}>{coach ? `${coachName}'s small groups` : 'Small groups'}</Text>
        <Text style={styles.sub}>
          Join an open group session, or go back to the coach profile to ask about another time.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
        }
        renderItem={({ item }) => {
          const spots =
            item.max_participants != null
              ? Math.max(0, item.max_participants - (item.current_participants ?? 0))
              : null;
          const price = formatPrice(item);
          const cartQuantity = sessionLineCount(item.id);
          const canAdd = spots == null || cartQuantity < spots;
          return (
            <View style={styles.card}>
              {item.coach ? (
                <View style={styles.coachRow}>
                  {item.coach.photo_url ? (
                    <Image source={{ uri: item.coach.photo_url }} style={styles.avatar} resizeMode="contain" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarLetter}>{item.coach.first_name?.[0] ?? '?'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.coachName}>
                      {item.coach.first_name} {item.coach.last_name}
                    </Text>
                    {item.coach.school ? <Text style={styles.meta}>{item.coach.school}</Text> : null}
                  </View>
                </View>
              ) : null}
              <Text style={styles.kicker}>SMALL GROUP</Text>
              <Text style={styles.cardTitle}>{item.focus_area?.trim() || 'Small-group training'}</Text>
              <Text style={styles.meta}>{formatWhen(item.scheduled_datetime)}</Text>
              {item.facility?.name ? <Text style={styles.meta}>{item.facility.name}</Text> : null}
              <View style={styles.footer}>
                <Text style={styles.cta}>
                  {spots != null ? `${spots} spot${spots === 1 ? '' : 's'} left` : 'Join'}
                </Text>
                {price ? <Text style={styles.price}>{price}</Text> : null}
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.secondaryButton} onPress={() => router.push(`/session/${item.id}`)}>
                  <Text style={styles.secondaryText}>View session</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, !canAdd && styles.buttonUnavailable]}
                  onPress={() => void addTrainingToCart(item.id)}
                  disabled={!canAdd || addingSessionId !== null}
                >
                  <Text style={styles.primaryText}>
                    {addingSessionId === item.id
                      ? 'Adding…'
                      : cartQuantity > 0
                        ? 'Add another spot'
                        : 'Add to cart'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No open small groups right now</Text>
            <Text style={styles.empty}>
              This coach does not have any open group spots. View availability or ask about another time.
            </Text>
            <Pressable style={styles.emptyButton} onPress={() => router.push(`/coach/${coachId}`)}>
              <Text style={styles.emptyButtonText}>Back to coach</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  eyebrow: { ...typography.brand, color: colors.accent, fontSize: 12, marginBottom: 8 },
  title: { ...typography.display, color: colors.text, fontSize: 30 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  error: { ...typography.body, color: colors.danger, marginTop: 10 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.black,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { ...typography.bodyBold, color: colors.accent, fontSize: 15 },
  coachName: { ...typography.bodySemi, color: colors.text, fontSize: 15 },
  kicker: { ...typography.brand, fontSize: 10, color: colors.accent, marginBottom: 6 },
  cardTitle: { ...typography.bodySemi, color: colors.text, fontSize: 17 },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: 4, fontSize: 13 },
  footer: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cta: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
  price: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  primaryButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 4,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...typography.bodyBold, color: colors.black, fontSize: 12 },
  secondaryButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typography.bodyBold, color: colors.text, fontSize: 12 },
  buttonUnavailable: { opacity: 0.4 },
  emptyState: { marginTop: 16 },
  emptyTitle: { ...typography.bodySemi, color: colors.text, fontSize: 16 },
  empty: { ...typography.body, color: colors.textMuted, marginTop: 12, lineHeight: 20 },
  emptyButton: {
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH_TARGET,
    marginTop: 16,
    paddingHorizontal: 18,
    borderRadius: 4,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 13 },
});
