import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { statusLabel } from '@/components/session-detail-view';
import { fetchFamilyBookings, sessionTypeLabel, type MobileBooking } from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';
import { coachSessionTitle, fetchCoachUpcomingSessions, type CoachSessionRow } from '@/lib/coach-data';

const ENDED_STATUSES = new Set(['completed', 'cancelled', 'no-show']);

function isUpcoming(b: MobileBooking): boolean {
  if (ENDED_STATUSES.has(b.status)) return false;
  return new Date(b.scheduled_datetime).getTime() >= Date.now();
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

function statusColor(status: string): string {
  if (status === 'cancelled' || status === 'no-show') return colors.danger;
  if (status === 'completed') return colors.textSecondary;
  return colors.success;
}

export default function BookingsScreen() {
  const { isCoachView } = useAuth();
  return isCoachView ? <CoachScheduleScreen /> : <ParentBookingsScreen />;
}

function CoachScheduleScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<CoachSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      setSessions(await fetchCoachUpcomingSessions(user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load schedule');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  return (
    <FlatList
      style={styles.screen}
      data={sessions}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.kicker}>COACH</Text>
          <Text style={styles.heading}>Schedule</Text>
          <Text style={styles.scheduleIntro}>Upcoming sessions, athletes, and open capacity.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/session/${item.id}`)}>
          <View style={styles.cardTop}>
            <Text style={styles.typeLabel}>{sessionTypeLabel(item.session_type).toUpperCase()}</Text>
            <Text style={[styles.status, { color: colors.success }]}>Scheduled</Text>
          </View>
          <Text style={styles.title}>{coachSessionTitle(item)}</Text>
          <Text style={styles.meta}>{formatWhen(item.scheduled_datetime)}</Text>
          {item.facilities?.name ? <Text style={styles.meta}>{item.facilities.name}</Text> : null}
          {item.max_participants != null ? (
            <Text style={styles.meta}>{item.current_participants ?? 0}/{item.max_participants} athletes</Text>
          ) : null}
        </Pressable>
      )}
      ListEmptyComponent={
        !loading ? <Text style={styles.empty}>No upcoming sessions. Create one from Coach Home.</Text> : null
      }
    />
  );
}

function ParentBookingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string }>();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<MobileBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const list = await fetchFamilyBookings(user.id);
      setBookings(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bookings');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const sections = useMemo(() => {
    const upcoming = bookings
      .filter(isUpcoming)
      .sort(
        (a, b) =>
          new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
      );
    const past = bookings
      .filter((b) => !isUpcoming(b))
      .sort(
        (a, b) =>
          new Date(b.scheduled_datetime).getTime() - new Date(a.scheduled_datetime).getTime()
      );
    const out: { title: string; data: MobileBooking[] }[] = [];
    if (params.view === 'past') {
      if (past.length > 0) out.push({ title: 'Past', data: past });
    } else if (upcoming.length > 0) {
      out.push({ title: 'Upcoming', data: upcoming });
    }
    return out;
  }, [bookings, params.view]);

  if (loading && bookings.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SectionList
      style={styles.screen}
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load()}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: 8 }}>
          <Text style={styles.kicker}>{params.view === 'past' ? 'HISTORY' : 'MY TRAINING'}</Text>
          <Text style={styles.heading}>{params.view === 'past' ? 'Training history' : 'Upcoming'}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/booking/${item.id}`)}>
          <View style={styles.cardTop}>
            <Text style={styles.typeLabel}>{sessionTypeLabel(item.session_type).toUpperCase()}</Text>
            <Text style={[styles.status, { color: statusColor(item.status) }]}>
              {statusLabel(item.status)}
            </Text>
          </View>
          <Text style={styles.title}>
            {item.focus_area?.trim() ||
              (item.coach ? `${item.coach.first_name} ${item.coach.last_name}` : 'Session')}
          </Text>
          <Text style={styles.meta}>{formatWhen(item.scheduled_datetime)}</Text>
          {item.coach && item.focus_area?.trim() ? (
            <Text style={styles.meta}>
              {item.coach.first_name} {item.coach.last_name}
            </Text>
          ) : null}
          {item.facility?.name ? <Text style={styles.meta}>{item.facility.name}</Text> : null}
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {params.view === 'past'
            ? 'No past sessions yet.'
            : 'No upcoming training. Choose Available or Request to get started.'}
        </Text>
      }
    />
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
  list: { padding: 20, paddingBottom: 40 },
  kicker: { ...typography.brand, fontSize: 11, color: colors.accent, marginBottom: 8 },
  heading: { ...typography.display, fontSize: 28, color: colors.text },
  scheduleIntro: { ...typography.body, color: colors.textMuted, marginTop: 6, fontSize: 14 },
  sectionTitle: {
    ...typography.brand,
    fontSize: 12,
    color: colors.accent,
    marginTop: 16,
    marginBottom: 10,
  },
  error: { color: colors.danger, marginTop: 8, fontFamily: 'Inter_400Regular' },
  empty: { ...typography.body, color: colors.textMuted, marginTop: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  typeLabel: {
    ...typography.brand,
    fontSize: 10,
    color: colors.accent,
  },
  status: { ...typography.bodySemi, fontSize: 12 },
  title: { ...typography.bodySemi, fontSize: 16, color: colors.text },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: 4, fontSize: 13 },
});
