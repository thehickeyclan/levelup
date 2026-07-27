import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type WindowRow = { day_of_week: number; start_time: string; end_time: string };
type PresetKey = 'weekday_evenings' | 'saturday_morning' | 'sunday_afternoon';

const PRESETS: Record<PresetKey, { title: string; detail: string; windows: WindowRow[] }> = {
  weekday_evenings: {
    title: 'Weekday evenings',
    detail: 'Monday–Friday · 5:00–8:00 PM',
    windows: [1, 2, 3, 4, 5].map((day) => ({ day_of_week: day, start_time: '17:00', end_time: '20:00' })),
  },
  saturday_morning: {
    title: 'Saturday morning',
    detail: 'Saturday · 9:00 AM–12:00 PM',
    windows: [{ day_of_week: 6, start_time: '09:00', end_time: '12:00' }],
  },
  sunday_afternoon: {
    title: 'Sunday afternoon',
    detail: 'Sunday · 1:00–5:00 PM',
    windows: [{ day_of_week: 0, start_time: '13:00', end_time: '17:00' }],
  },
};

export default function CoachAvailabilitySetupScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<PresetKey>>(new Set());
  const [existingCount, setExistingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ windows: WindowRow[] }>('/api/coach/availability/weekly');
      setExistingCount(data.windows?.length ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load availability');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const windows = useMemo(
    () => [...selected].flatMap((key) => PRESETS[key].windows),
    [selected]
  );

  function toggle(key: PresetKey) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (windows.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/coach/availability/weekly', {
        method: 'PUT',
        body: JSON.stringify({ windows }),
      });
      await apiFetch('/api/coach/availability/apply-weekly-slots', {
        method: 'POST',
        body: JSON.stringify({ days: 28 }),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save availability');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>NORMAL WEEK</Text>
      <Text style={styles.heading}>When do you usually coach?</Text>
      <Text style={styles.intro}>
        Pick the times that normally work. The Guild will repeat them every week; you only manage exceptions.
      </Text>
      {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} /> : null}
      {existingCount > 0 ? (
        <Text style={styles.existing}>
          You already have {existingCount} weekly window{existingCount === 1 ? '' : 's'}. Saving here replaces that normal week.
        </Text>
      ) : null}
      {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
        const preset = PRESETS[key];
        const active = selected.has(key);
        return (
          <Pressable key={key} style={[styles.option, active && styles.optionActive]} onPress={() => toggle(key)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{preset.title}</Text>
              <Text style={styles.optionMeta}>{preset.detail}</Text>
            </View>
            <Text style={[styles.check, active && styles.checkActive]}>{active ? '✓' : '○'}</Text>
          </Pressable>
        );
      })}
      <Pressable style={[styles.save, windows.length === 0 && styles.disabled]} onPress={() => void save()} disabled={saving || windows.length === 0}>
        {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveText}>Use this normal week</Text>}
      </Pressable>
      <Pressable style={styles.custom} onPress={() => router.push('/coach-availability-custom')}>
        <Text style={styles.customText}>I’ll customize my hours</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 29, lineHeight: 35 },
  intro: { ...typography.body, color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  existing: { ...typography.body, color: colors.accentLight, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 76, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 5, marginBottom: 10 },
  optionActive: { borderColor: colors.accent },
  optionTitle: { ...typography.bodySemi, color: colors.text, fontSize: 15 },
  optionMeta: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  check: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 24 },
  checkActive: { color: colors.accent },
  save: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 4, marginTop: 10 },
  disabled: { opacity: 0.45 },
  saveText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  custom: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  customText: { ...typography.bodySemi, color: colors.accent, fontSize: 13 },
  error: { ...typography.body, color: colors.danger, marginTop: 12 },
});
