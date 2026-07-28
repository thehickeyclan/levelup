import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fetchSessionDetail, sessionTypeLabel, type RosterParticipant } from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';

type Attendance = Record<string, 'attended' | 'no_show'>;

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CoachSessionCloseoutScreen() {
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const router = useRouter();
  const { isCoachView } = useAuth();
  const [roster, setRoster] = useState<RosterParticipant[]>([]);
  const [title, setTitle] = useState('Session');
  const [when, setWhen] = useState('');
  const [location, setLocation] = useState('');
  const [attendance, setAttendance] = useState<Attendance>({});
  const [cancelMode, setCancelMode] = useState(action === 'cancel');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSessionDetail(id)
      .then(({ session, roster: nextRoster }) => {
        if (!active) return;
        setRoster(nextRoster);
        setTitle(session.focus_area?.trim() || sessionTypeLabel(session.session_type));
        setWhen(formatWhen(session.scheduled_datetime));
        setLocation(session.facility?.name ?? '');
        setAttendance(
          Object.fromEntries(
            nextRoster
              .filter((participant) => participant.participantId)
              .map((participant) => [
                participant.participantId as string,
                participant.attendanceStatus ?? 'attended',
              ])
          )
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

  function setStatus(participantId: string, status: 'attended' | 'no_show') {
    setAttendance((current) => ({ ...current, [participantId]: status }));
  }

  async function complete() {
    if (saving) return;
    const participantRows = roster.filter((participant) => participant.participantId);
    if (participantRows.some((participant) => !attendance[participant.participantId as string])) {
      setError('Record attended or no-show for every athlete.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/sessions/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          attendance: participantRows.map((participant) => ({
            participantId: participant.participantId,
            status: attendance[participant.participantId as string],
          })),
        }),
      });
      Alert.alert('Session closed', 'Attendance is saved and the session is complete.', [
        { text: 'Done', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not close session');
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (saving) return;
    if (!reason.trim()) {
      setError('Add a short reason so families know why the session was cancelled.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{ message?: string }>(`/api/sessions/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      Alert.alert('Session cancelled', result.message ?? 'Families have been notified.', [
        { text: 'Done', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel session');
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>SESSION CLOSEOUT</Text>
      <Text style={styles.heading}>{cancelMode ? 'Cancel session' : 'Who trained?'}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>{when}</Text>
      {location ? <Text style={styles.meta}>{location}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {cancelMode ? (
        <>
          <Text style={styles.explainer}>
            Cancel only when the entire session did not happen. Paid families receive Guild credit
            and everyone is notified.
          </Text>
          <Text style={styles.label}>REASON FOR FAMILIES</Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Example: Facility closed unexpectedly"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <Pressable style={styles.danger} onPress={() => void cancel()} disabled={saving}>
            <Text style={styles.dangerText}>{saving ? 'Cancelling…' : 'Cancel entire session'}</Text>
          </Pressable>
          <Pressable style={styles.link} onPress={() => setCancelMode(false)}>
            <Text style={styles.linkText}>Back to attendance</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.explainer}>
            Mark each athlete. A child who missed a group is a no-show; the session itself can still
            be completed.
          </Text>
          {roster.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No athletes registered</Text>
              <Text style={styles.emptyText}>You can close this session with an empty roster.</Text>
            </View>
          ) : (
            roster.map((participant, index) => {
              const participantId = participant.participantId;
              if (!participantId) return null;
              const status = attendance[participantId] ?? 'attended';
              return (
                <View key={participantId} style={styles.athlete}>
                  <View style={styles.athleteCopy}>
                    <Text style={styles.athleteName}>{participant.name || `Athlete ${index + 1}`}</Text>
                    <Text style={styles.athleteMeta}>
                      {[participant.age ? `${participant.age}y` : null, participant.weightClass, participant.skillLevel]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.statusRow}>
                    <Pressable
                      style={[styles.status, status === 'attended' && styles.attended]}
                      onPress={() => setStatus(participantId, 'attended')}
                    >
                      <Text style={[styles.statusText, status === 'attended' && styles.selectedText]}>
                        Attended
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.status, status === 'no_show' && styles.noShow]}
                      onPress={() => setStatus(participantId, 'no_show')}
                    >
                      <Text style={[styles.statusText, status === 'no_show' && styles.selectedText]}>
                        No-show
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
          <Pressable style={styles.primary} onPress={() => void complete()} disabled={saving}>
            <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save attendance & complete'}</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              style={styles.secondary}
              onPress={() => router.push(`/coach-session-reschedule/${id}`)}
            >
              <Text style={styles.secondaryText}>Reschedule entire session</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setCancelMode(true)}>
              <Text style={styles.secondaryText}>Cancel entire session</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
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
  heading: { ...typography.display, color: colors.text, fontSize: 34, marginBottom: 16 },
  title: { ...typography.bodyBold, color: colors.text, fontSize: 19 },
  meta: { ...typography.body, color: colors.textMuted, fontSize: 14, marginTop: 4 },
  explainer: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginVertical: 22,
  },
  error: { ...typography.bodyMedium, color: colors.danger, marginTop: 14 },
  athlete: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  athleteCopy: { marginBottom: 13 },
  athleteName: { ...typography.bodyBold, color: colors.text, fontSize: 17 },
  athleteMeta: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 4 },
  statusRow: { flexDirection: 'row', gap: 10 },
  status: {
    flex: 1,
    minHeight: 43,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attended: { backgroundColor: '#147a51', borderColor: '#1fa66f' },
  noShow: { backgroundColor: '#8c3434', borderColor: '#c74b4b' },
  statusText: { ...typography.bodyBold, color: colors.textMuted, fontSize: 14 },
  selectedText: { color: '#fff' },
  empty: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 18,
    marginBottom: 14,
  },
  emptyTitle: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  emptyText: { ...typography.body, color: colors.textMuted, marginTop: 4 },
  primary: {
    minHeight: 54,
    backgroundColor: colors.accent,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  actions: { gap: 10, marginTop: 12 },
  secondary: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
  label: { ...typography.brand, color: colors.textMuted, fontSize: 11, marginBottom: 8 },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
    color: colors.text,
    textAlignVertical: 'top',
    ...typography.body,
  },
  danger: {
    minHeight: 52,
    backgroundColor: '#a63737',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  dangerText: { ...typography.bodyBold, color: '#fff', fontSize: 15 },
  link: { alignItems: 'center', padding: 18 },
  linkText: { ...typography.bodyMedium, color: colors.accent },
});
