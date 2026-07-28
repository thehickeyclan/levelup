import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fetchSessionDetail, sessionTypeLabel } from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';

const TIME_OPTIONS = Array.from({ length: 33 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export default function CoachSessionRescheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isCoachView } = useAuth();
  const dateOptions = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index + 1);
        return {
          value: localDateKey(date),
          weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
          label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        };
      }),
    []
  );
  const [title, setTitle] = useState('Session');
  const [scheduledDate, setScheduledDate] = useState(dateOptions[0]?.value ?? '');
  const [scheduledTime, setScheduledTime] = useState('17:00');
  const [showTimes, setShowTimes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSessionDetail(id)
      .then(({ session }) => {
        if (!active) return;
        setTitle(session.focus_area?.trim() || sessionTypeLabel(session.session_type));
        const original = new Date(session.scheduled_datetime);
        setScheduledTime(
          `${String(original.getHours()).padStart(2, '0')}:${String(
            original.getMinutes() < 30 ? 0 : 30
          ).padStart(2, '0')}`
        );
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load session');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (!isCoachView) return <Redirect href="/(tabs)" />;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/sessions/${id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduledDate, scheduledTime }),
      });
      Alert.alert('Session rescheduled', 'Registered families have been notified.', [
        { text: 'Done', onPress: () => router.replace(`/session/${id}`) },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reschedule session');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>RESCHEDULE SESSION</Text>
        <Text style={styles.heading}>Choose a new time.</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.help}>
          The roster stays with the session and registered families receive an alert with the new
          time.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>NEW DATE</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateRow}
        >
          {dateOptions.map((option) => {
            const selected = option.value === scheduledDate;
            return (
              <Pressable
                key={option.value}
                style={[styles.date, selected && styles.dateSelected]}
                onPress={() => setScheduledDate(option.value)}
              >
                <Text style={[styles.dateWeekday, selected && styles.selectedText]}>
                  {option.weekday}
                </Text>
                <Text style={[styles.dateLabel, selected && styles.selectedText]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>NEW START TIME</Text>
        <Pressable style={styles.timeField} onPress={() => setShowTimes(true)}>
          <Text style={styles.timeText}>{formatTime(scheduledTime)}</Text>
        </Pressable>

        <Pressable style={styles.primary} onPress={() => void save()} disabled={saving}>
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Reschedule & notify families'}</Text>
        </Pressable>
      </ScrollView>
      <Modal visible={showTimes} transparent animationType="slide" onRequestClose={() => setShowTimes(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose start time</Text>
            <FlatList
              data={TIME_OPTIONS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.timeOption, item === scheduledTime && styles.timeOptionSelected]}
                  onPress={() => {
                    setScheduledTime(item);
                    setShowTimes(false);
                  }}
                >
                  <Text style={styles.timeOptionText}>{formatTime(item)}</Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.close} onPress={() => setShowTimes(false)}>
              <Text style={styles.closeText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { padding: 24, paddingBottom: 60 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 12, marginBottom: 10 },
  heading: { ...typography.display, color: colors.text, fontSize: 34, marginBottom: 14 },
  title: { ...typography.bodyBold, color: colors.text, fontSize: 18 },
  help: { ...typography.body, color: colors.textMuted, fontSize: 15, lineHeight: 22, marginVertical: 18 },
  error: { ...typography.bodyMedium, color: colors.danger, marginBottom: 14 },
  label: { ...typography.brand, color: colors.textMuted, fontSize: 11, marginTop: 16, marginBottom: 9 },
  dateRow: { gap: 9, paddingRight: 20 },
  date: {
    minWidth: 78,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dateSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dateWeekday: { ...typography.bodyBold, color: colors.text, fontSize: 13 },
  dateLabel: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 3 },
  selectedText: { color: colors.black },
  timeField: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  timeText: { ...typography.bodyBold, color: colors.text, fontSize: 17 },
  primary: {
    minHeight: 54,
    backgroundColor: colors.accent,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
  },
  primaryText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalCard: {
    maxHeight: '72%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
  },
  modalTitle: { ...typography.bodyBold, color: colors.text, fontSize: 19, marginBottom: 12 },
  timeOption: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeOptionSelected: { backgroundColor: colors.surfaceRaised },
  timeOptionText: { ...typography.bodyMedium, color: colors.text, textAlign: 'center' },
  close: { padding: 16, alignItems: 'center' },
  closeText: { ...typography.bodyBold, color: colors.accent },
});
