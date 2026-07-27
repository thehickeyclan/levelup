import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type AvailabilityWindow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type Slot = {
  time: string;
  facilityId: string | null;
};

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function labelDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function labelTime(value: string): string {
  const [hourRaw, minute = '00'] = value.split(':');
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

export default function CoachPublicAvailabilityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [dated, setDated] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      setError(null);
      try {
        const data = await apiFetch<{
          availability?: AvailabilityWindow[];
          availabilityDates?: string[];
          blockedDates?: string[];
        }>(`/api/availability?athleteId=${encodeURIComponent(id)}`);
        if (!cancelled) {
          setWindows(data.availability ?? []);
          setDated(data.availabilityDates ?? []);
          setBlocked(data.blockedDates ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load availability');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dates = useMemo(() => {
    const datedSet = new Set(dated);
    const blockedSet = new Set(blocked);
    const weeklyDays = new Set(windows.map((window) => window.day_of_week));
    return Array.from({ length: 14 }, (_, offset) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      return { value: dateOnly(date), day: date.getDay() };
    })
      .filter(({ value, day }) => !blockedSet.has(value) && (datedSet.has(value) || weeklyDays.has(day)))
      .map(({ value }) => value);
  }, [blocked, dated, windows]);

  const loadSlots = useCallback(
    async (value: string) => {
      if (!id) return;
      setSelectedDate(value);
      setSlotsLoading(true);
      setError(null);
      try {
        const data = await apiFetch<{ slots?: Slot[] }>(
          `/api/availability/slots?athleteId=${encodeURIComponent(id)}&date=${encodeURIComponent(value)}`
        );
        setSlots(data.slots ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load open times');
      } finally {
        setSlotsLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    if (!selectedDate && dates[0]) void loadSlots(dates[0]);
  }, [dates, loadSlots, selectedDate]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={slots}
        keyExtractor={(slot, index) => `${slot.time}-${slot.facilityId ?? 'default'}-${index}`}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={styles.kicker}>PUBLIC CALENDAR</Text>
            <Text style={styles.heading}>Open coaching times</Text>
            <Text style={styles.sub}>
              This is the availability families can currently see. Private blocks and internal
              calendar details remain hidden.
            </Text>
            <FlatList
              horizontal
              data={dates}
              keyExtractor={(value) => value}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dates}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.date, selectedDate === item && styles.dateSelected]}
                  onPress={() => void loadSlots(item)}
                >
                  <Text style={[styles.dateText, selectedDate === item && styles.dateTextSelected]}>
                    {labelDate(item)}
                  </Text>
                </Pressable>
              )}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {slotsLoading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.slot}>
            <Text style={styles.slotTime}>{labelTime(item.time)}</Text>
            <Text style={styles.slotMeta}>Publicly available</Text>
          </View>
        )}
        ListEmptyComponent={
          !slotsLoading ? (
            <Text style={styles.empty}>
              {dates.length === 0
                ? 'No public availability is published for the next two weeks.'
                : 'No open times remain on this date.'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10 },
  heading: { ...typography.display, color: colors.text, fontSize: 32, marginTop: 6 },
  sub: { ...typography.body, color: colors.textSecondary, lineHeight: 20, marginTop: 6 },
  dates: { gap: 8, paddingVertical: 18 },
  date: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
  },
  dateSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  dateText: { ...typography.bodySemi, color: colors.textSecondary, fontSize: 11 },
  dateTextSelected: { color: colors.accent },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginBottom: 12 },
  loading: { marginVertical: 18 },
  slot: {
    minHeight: 64,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  slotTime: { ...typography.bodyBold, color: colors.text, fontSize: 17 },
  slotMeta: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 3 },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: 28 },
});
