import { useCallback, useState } from 'react';
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
  fetchActiveCoaches,
  fetchOpenSmallGroupSessions,
  type MobileCoach,
  type OpenSmallGroupSession,
} from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';

type Tab = 'groups' | 'coaches';

function parseTab(raw: string | string[] | undefined): Tab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'coaches' || v === 'privates' ? 'coaches' : 'groups';
}

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

export default function FindScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(() => parseTab(params.tab));
  const [sessions, setSessions] = useState<OpenSmallGroupSession[]>([]);
  const [coaches, setCoaches] = useState<MobileCoach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [groupList, coachList] = await Promise.all([
        fetchOpenSmallGroupSessions(),
        fetchActiveCoaches(),
      ]);
      setSessions(groupList);
      setCoaches(coachList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load training');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (params.tab) setTab(parseTab(params.tab));
      setLoading(true);
      void load();
    }, [params.tab, load])
  );

  if (loading && sessions.length === 0 && coaches.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.kicker}>TRAINING</Text>
        <Text style={styles.heading}>Find training</Text>
        <Text style={styles.sub}>
          Join an open small group or book private training with a Guild coach.
        </Text>

        <View style={styles.segment}>
          <Pressable
            style={[styles.segmentBtn, tab === 'groups' && styles.segmentBtnActive]}
            onPress={() => {
              setTab('groups');
              router.setParams({ tab: 'groups' });
            }}
          >
            <Text style={[styles.segmentText, tab === 'groups' && styles.segmentTextActive]}>
              Small groups
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentBtn, tab === 'coaches' && styles.segmentBtnActive]}
            onPress={() => {
              setTab('coaches');
              router.setParams({ tab: 'coaches' });
            }}
          >
            <Text style={[styles.segmentText, tab === 'coaches' && styles.segmentTextActive]}>
              Privates
            </Text>
          </Pressable>
          <Pressable style={styles.segmentBtn} onPress={() => router.push('/coach-map')}>
            <Text style={styles.segmentText}>Map</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {tab === 'groups' ? (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load()}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => {
            const spots =
              item.max_participants != null
                ? Math.max(0, item.max_participants - (item.current_participants ?? 0))
                : null;
            const price = formatPrice(item);
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/session/${item.id}`)}>
                <Text style={styles.cardKicker}>SMALL GROUP</Text>
                <Text style={styles.cardTitle}>
                  {item.focus_area?.trim() ||
                    (item.coach
                      ? `${item.coach.first_name} ${item.coach.last_name}`
                      : 'Open session')}
                </Text>
                <Text style={styles.cardMeta}>{formatWhen(item.scheduled_datetime)}</Text>
                {item.coach && item.focus_area?.trim() ? (
                  <Text style={styles.cardMeta}>
                    {item.coach.first_name} {item.coach.last_name}
                    {item.coach.school ? ` · ${item.coach.school}` : ''}
                  </Text>
                ) : item.coach?.school ? (
                  <Text style={styles.cardMeta}>{item.coach.school}</Text>
                ) : null}
                {item.facility?.name ? (
                  <Text style={styles.cardMeta}>{item.facility.name}</Text>
                ) : null}
                <View style={styles.cardFooter}>
                  <Text style={styles.cta}>
                    {spots != null ? `${spots} spot${spots === 1 ? '' : 's'} left` : 'Join'}
                  </Text>
                  {price ? <Text style={styles.price}>{price}</Text> : null}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No open small groups right now. Check Privates to book 1:1, or pull to refresh.
            </Text>
          }
        />
      ) : (
        <FlatList
          data={coaches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load()}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/coach/${item.id}`)}>
              {item.photo_url ? (
                <Image source={{ uri: item.photo_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarLetter}>{item.first_name?.[0] ?? '?'}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {item.first_name} {item.last_name}
                </Text>
                <Text style={styles.meta}>{item.school ?? 'Coach'}</Text>
                {item.review_count ? (
                  <Text style={styles.meta}>
                    ★ {Number(item.average_rating ?? 0).toFixed(1)} · {item.review_count} reviews
                  </Text>
                ) : null}
              </View>
              <Text style={styles.cta}>Book</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No coaches available right now.</Text>}
        />
      )}
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
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  kicker: { ...typography.brand, fontSize: 11, color: colors.accent, marginBottom: 8 },
  heading: { ...typography.display, fontSize: 28, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted, marginTop: 6, fontSize: 14, marginBottom: 16 },
  segment: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  segmentText: { ...typography.bodyMedium, fontSize: 13, color: colors.textSecondary },
  segmentTextActive: { ...typography.bodyBold, color: colors.accent },
  error: { color: colors.danger, marginTop: 8, fontFamily: 'Inter_400Regular' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  empty: { ...typography.body, color: colors.textMuted, marginTop: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  cardKicker: {
    ...typography.brand,
    fontSize: 10,
    color: colors.accent,
    marginBottom: 6,
  },
  cardTitle: { ...typography.bodySemi, fontSize: 17, color: colors.text },
  cardMeta: { ...typography.body, color: colors.textSecondary, marginTop: 4, fontSize: 13 },
  cardFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 76,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { ...typography.bodyBold, fontSize: 18, color: colors.accent },
  name: { ...typography.bodySemi, fontSize: 16, color: colors.text },
  meta: { ...typography.body, color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  cta: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
});
