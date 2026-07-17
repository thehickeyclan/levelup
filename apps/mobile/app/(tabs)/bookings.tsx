import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { statusLabel } from '@/components/session-detail-view';
import { fetchFamilyBookings, sessionTypeLabel, type MobileBooking } from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';

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
  const router = useRouter();
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
    if (upcoming.length > 0) out.push({ title: 'Upcoming', data: upcoming });
    if (past.length > 0) out.push({ title: 'Past', data: past });
    return out;
  }, [bookings]);

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
          <Text style={styles.kicker}>SCHEDULE</Text>
          <Text style={styles.heading}>My bookings</Text>
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
          No bookings yet. Join a small group or book a private from Train.
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
