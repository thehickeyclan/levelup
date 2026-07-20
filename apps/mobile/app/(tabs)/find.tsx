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
  fetchActiveCoaches,
  fetchFamilyBookings,
  fetchOpenSmallGroupSessions,
  sessionTypeLabel,
  type MobileBooking,
  type MobileCoach,
  type OpenSmallGroupSession,
} from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { statusLabel } from '@/components/session-detail-view';

type Tab = 'available' | 'request' | 'mine';

function parseTab(raw: string | string[] | undefined): Tab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'groups' || v === 'available') return 'available';
  if (v === 'mine' || v === 'bookings') return 'mine';
  return 'request';
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
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(() => parseTab(params.tab));
  const [sessions, setSessions] = useState<OpenSmallGroupSession[]>([]);
  const [coaches, setCoaches] = useState<MobileCoach[]>([]);
  const [bookings, setBookings] = useState<MobileBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [groupList, coachList, bookingList] = await Promise.all([
        fetchOpenSmallGroupSessions(),
        fetchActiveCoaches(),
        user ? fetchFamilyBookings(user.id) : Promise.resolve([]),
      ]);
      setSessions(groupList);
      setCoaches(coachList);
      setBookings(bookingList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load training');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            !['completed', 'cancelled', 'no-show'].includes(booking.status) &&
            new Date(booking.scheduled_datetime).getTime() >= Date.now()
        )
        .sort(
          (a, b) =>
            new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
        ),
    [bookings]
  );

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
        <Text style={styles.heading}>Training</Text>
        <Text style={styles.sub}>
          Join an open session or ask a coach to create private, partner, or small-group training.
        </Text>

        <View style={styles.segment}>
          <Pressable
            style={[styles.segmentBtn, tab === 'available' && styles.segmentBtnActive]}
            onPress={() => {
              setTab('available');
              router.setParams({ tab: 'available' });
            }}
          >
            <Text style={[styles.segmentText, tab === 'available' && styles.segmentTextActive]}>
              Available
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentBtn, tab === 'request' && styles.segmentBtnActive]}
            onPress={() => {
              setTab('request');
              router.setParams({ tab: 'request' });
            }}
          >
            <Text style={[styles.segmentText, tab === 'request' && styles.segmentTextActive]}>
              Request
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentBtn, tab === 'mine' && styles.segmentBtnActive]}
            onPress={() => {
              setTab('mine');
              router.setParams({ tab: 'mine' });
            }}
          >
            <Text style={[styles.segmentText, tab === 'mine' && styles.segmentTextActive]}>
              My Training
            </Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {tab === 'available' ? (
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
      ) : tab === 'request' ? (
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
      ) : (
        <FlatList
          data={upcomingBookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/booking/${item.id}`)}>
              <View style={styles.bookingTop}>
                <Text style={styles.cardKicker}>{sessionTypeLabel(item.session_type).toUpperCase()}</Text>
                <Text style={styles.bookingStatus}>{statusLabel(item.status)}</Text>
              </View>
              <Text style={styles.cardTitle}>
                {item.focus_area?.trim() ||
                  (item.coach ? `${item.coach.first_name} ${item.coach.last_name}` : 'Training')}
              </Text>
              <Text style={styles.cardMeta}>{formatWhen(item.scheduled_datetime)}</Text>
              {item.facility?.name ? <Text style={styles.cardMeta}>{item.facility.name}</Text> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <View>
              <Text style={styles.empty}>No upcoming training.</Text>
              <Pressable
                style={styles.historyLink}
                onPress={() => router.push({ pathname: '/(tabs)/bookings', params: { view: 'past' } })}
              >
                <Text style={styles.cta}>View training history</Text>
              </Pressable>
            </View>
          }
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
  bookingTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookingStatus: { ...typography.bodySemi, color: colors.success, fontSize: 12 },
  historyLink: { minHeight: 48, justifyContent: 'center', marginTop: 12 },
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
