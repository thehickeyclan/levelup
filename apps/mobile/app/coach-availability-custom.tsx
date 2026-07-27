import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type WindowRow = {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type DraftWindow = WindowRow & { key: string };
type TimeTarget = { key: string; field: 'start_time' | 'end_time' } | null;

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

const TIME_OPTIONS = Array.from({ length: 35 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
});

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function draftKey(row: WindowRow, index: number) {
  return row.id ?? `${row.day_of_week}-${row.start_time}-${row.end_time}-${index}`;
}

export default function CoachAvailabilityCustomScreen() {
  const router = useRouter();
  const [windows, setWindows] = useState<DraftWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeTarget, setTimeTarget] = useState<TimeTarget>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ windows: WindowRow[] }>('/api/coach/availability/weekly');
      setWindows(
        (data.windows ?? []).map((row, index) => ({
          ...row,
          start_time: row.start_time.slice(0, 5),
          end_time: row.end_time.slice(0, 5),
          key: draftKey(row, index),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load availability');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const targetWindow = useMemo(
    () => (timeTarget ? windows.find((window) => window.key === timeTarget.key) : null),
    [timeTarget, windows]
  );

  function addWindow(day: number) {
    setWindows((current) => [
      ...current,
      {
        key: `new-${day}-${Date.now()}`,
        day_of_week: day,
        start_time: '17:00',
        end_time: '20:00',
      },
    ]);
  }

  function removeWindow(key: string) {
    setWindows((current) => current.filter((window) => window.key !== key));
  }

  function chooseTime(value: string) {
    if (!timeTarget) return;
    setWindows((current) =>
      current.map((window) =>
        window.key === timeTarget.key ? { ...window, [timeTarget.field]: value } : window
      )
    );
    setTimeTarget(null);
  }

  async function save() {
    if (saving) return;
    const invalid = windows.find(
      (window) => timeMinutes(window.end_time) - timeMinutes(window.start_time) < 60
    );
    if (invalid) {
      setError('Each availability window must be at least one hour.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/coach/availability/weekly', {
        method: 'PUT',
        body: JSON.stringify({
          windows: windows.map(({ day_of_week, start_time, end_time }) => ({
            day_of_week,
            start_time,
            end_time,
          })),
        }),
      });
      if (windows.length > 0) {
        await apiFetch('/api/coach/availability/apply-weekly-slots', {
          method: 'POST',
          body: JSON.stringify({ days: 28 }),
        });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save availability');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>WEEKLY AVAILABILITY</Text>
        <Text style={styles.heading}>Set your coaching hours</Text>
        <Text style={styles.intro}>
          Choose the hours that normally work each week. Parents can book from these times, and you
          can update them whenever your schedule changes.
        </Text>

        {loading ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}

        {!loading
          ? DAYS.map((day) => {
              const dayWindows = windows.filter((window) => window.day_of_week === day.value);
              return (
                <View key={day.value} style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayTitle}>{day.label}</Text>
                    <Pressable
                      style={styles.addButton}
                      onPress={() => addWindow(day.value)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${day.label} availability`}
                    >
                      <Text style={styles.addButtonText}>+ Add hours</Text>
                    </Pressable>
                  </View>
                  {dayWindows.length === 0 ? (
                    <Text style={styles.unavailable}>Unavailable</Text>
                  ) : (
                    dayWindows.map((window) => (
                      <View key={window.key} style={styles.windowRow}>
                        <Pressable
                          style={styles.timeButton}
                          onPress={() => setTimeTarget({ key: window.key, field: 'start_time' })}
                        >
                          <Text style={styles.timeLabel}>FROM</Text>
                          <Text style={styles.timeValue}>{formatTime(window.start_time)}</Text>
                        </Pressable>
                        <Text style={styles.to}>to</Text>
                        <Pressable
                          style={styles.timeButton}
                          onPress={() => setTimeTarget({ key: window.key, field: 'end_time' })}
                        >
                          <Text style={styles.timeLabel}>UNTIL</Text>
                          <Text style={styles.timeValue}>{formatTime(window.end_time)}</Text>
                        </Pressable>
                        <Pressable
                          style={styles.removeButton}
                          onPress={() => removeWindow(window.key)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${day.label} hours`}
                        >
                          <Text style={styles.removeText}>×</Text>
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              );
            })
          : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.save, saving && styles.disabled]} onPress={() => void save()} disabled={saving || loading}>
          {saving ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <Text style={styles.saveText}>Save weekly availability</Text>
          )}
        </Pressable>
        <Text style={styles.saveHelp}>
          Saving replaces your current weekly hours and publishes bookable times for the next four
          weeks.
        </Text>
      </ScrollView>

      <Modal visible={timeTarget !== null} transparent animationType="slide" onRequestClose={() => setTimeTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTimeTarget(null)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetKicker}>
                  {timeTarget?.field === 'start_time' ? 'START TIME' : 'END TIME'}
                </Text>
                <Text style={styles.sheetTitle}>
                  {targetWindow ? formatTime(targetWindow[timeTarget?.field ?? 'start_time']) : ''}
                </Text>
              </View>
              <Pressable onPress={() => setTimeTarget(null)}>
                <Text style={styles.done}>Done</Text>
              </Pressable>
            </View>
            <FlatList
              data={TIME_OPTIONS}
              keyExtractor={(item) => item}
              initialScrollIndex={Math.max(
                0,
                TIME_OPTIONS.indexOf(
                  targetWindow?.[timeTarget?.field ?? 'start_time'] ?? TIME_OPTIONS[0]
                ) - 2
              )}
              getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
              renderItem={({ item }) => {
                const selected =
                  targetWindow?.[timeTarget?.field ?? 'start_time'] === item;
                return (
                  <Pressable
                    style={[styles.timeOption, selected && styles.timeOptionSelected]}
                    onPress={() => chooseTime(item)}
                  >
                    <Text style={[styles.timeOptionText, selected && styles.timeOptionTextSelected]}>
                      {formatTime(item)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 29, lineHeight: 35 },
  intro: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 18,
  },
  loader: { marginVertical: 28 },
  dayCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
  },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTitle: { ...typography.bodySemi, color: colors.text, fontSize: 16 },
  addButton: { minHeight: 40, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { ...typography.bodyBold, color: colors.accent, fontSize: 12 },
  unavailable: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 8 },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  timeButton: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 5,
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  timeLabel: { ...typography.brand, color: colors.textSecondary, fontSize: 8 },
  timeValue: { ...typography.bodySemi, color: colors.text, fontSize: 13, marginTop: 3 },
  to: { ...typography.body, color: colors.textSecondary, fontSize: 11 },
  removeButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { ...typography.body, color: colors.danger, fontSize: 24 },
  save: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 5,
    marginTop: 14,
  },
  disabled: { opacity: 0.5 },
  saveText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  saveHelp: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 10,
  },
  error: { ...typography.body, color: colors.danger, marginTop: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '58%',
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetKicker: { ...typography.brand, color: colors.accent, fontSize: 9 },
  sheetTitle: { ...typography.bodySemi, color: colors.text, fontSize: 18, marginTop: 4 },
  done: { ...typography.bodyBold, color: colors.accent, fontSize: 14, padding: 10 },
  timeOption: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timeOptionSelected: { backgroundColor: colors.accentMuted },
  timeOptionText: { ...typography.body, color: colors.text, fontSize: 16 },
  timeOptionTextSelected: { ...typography.bodyBold, color: colors.accent },
});
