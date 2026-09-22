import { useState } from 'react';
import {
  ActivityIndicator,
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
import { colors, typography } from '@/lib/theme';

type SessionType = 'private' | 'partner' | 'small_group';

const FORMATS: Record<SessionType, { label: string; price: number; detail: string }> = {
  private: { label: 'Private', price: 60, detail: 'One-on-one' },
  partner: { label: 'Partner', price: 50, detail: 'Two athletes' },
  small_group: { label: 'Small group', price: 30, detail: 'Several athletes' },
};

const TIME_OPTIONS = Array.from({ length: 33 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

const DATE_OPTIONS = Array.from({ length: 14 }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() + index);
  return {
    value: localDateKey(date),
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
    date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    long: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
  };
});

/**
 * Parent-side session request: pick a format, day, and time, and it lands in
 * the coach's conversation as a structured request the coach can accept with
 * one tap (their offer screen opens prefilled). The trailing [request:...]
 * token is what the coach's app parses; see thread/[id].tsx.
 */
export default function RequestSessionScreen() {
  const router = useRouter();
  const { coach: coachUserId, name: coachName } = useLocalSearchParams<{
    coach: string;
    name?: string;
  }>();
  const { user, role } = useAuth();

  const [sessionType, setSessionType] = useState<SessionType>('private');
  const [scheduledDate, setScheduledDate] = useState(DATE_OPTIONS[1]?.value ?? DATE_OPTIONS[0].value);
  const [scheduledTime, setScheduledTime] = useState('17:00');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || role === 'coach') return <Redirect href="/(tabs)" />;
  if (!coachUserId) return <Redirect href="/(tabs)" />;

  const format = FORMATS[sessionType];
  const selectedDate = DATE_OPTIONS.find((option) => option.value === scheduledDate);

  async function send() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const { threadId } = await apiFetch<{ threadId: string }>(
        '/api/guild/messages/coach-inquiry',
        {
          method: 'POST',
          body: JSON.stringify({ coachUserId, senderMode: 'family' }),
        }
      );
      const trimmedNote = note.trim();
      const body =
        `Session request — ${format.label} · ${selectedDate?.long ?? scheduledDate} · ` +
        `${formatTime(scheduledTime)}.` +
        (trimmedNote ? ` ${trimmedNote}` : '') +
        `\n[request:${sessionType}:${scheduledDate}:${scheduledTime}]`;
      await apiFetch(`/api/guild/messages/threads/${threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, deliveryChannel: 'in_app' }),
      });
      router.replace({ pathname: '/thread/[id]', params: { id: threadId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request');
      setSending(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>SESSION REQUEST</Text>
      <Text style={styles.heading}>Request a session</Text>
      <Text style={styles.intro}>
        {coachName ? `${coachName} gets` : 'The coach gets'} your request in Messages and can
        accept it or suggest another time. Nothing is booked or charged yet.
      </Text>

      <Text style={styles.label}>FORMAT</Text>
      <View style={styles.typeRow}>
        {(Object.keys(FORMATS) as SessionType[]).map((type) => {
          const selected = sessionType === type;
          return (
            <Pressable
              key={type}
              style={[styles.typeButton, selected && styles.typeButtonSelected]}
              onPress={() => setSessionType(type)}
            >
              <Text style={[styles.typeTitle, selected && styles.typeTitleSelected]}>
                {FORMATS[type].label}
              </Text>
              <Text style={[styles.typeDetail, selected && styles.typeDetailSelected]}>
                ${FORMATS[type].price}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>DAY</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {DATE_OPTIONS.map((option) => {
          const selected = option.value === scheduledDate;
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setScheduledDate(option.value)}
            >
              <Text style={[styles.chipSmall, selected && styles.chipTextSelected]}>{option.weekday}</Text>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.date}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>TIME</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {TIME_OPTIONS.map((option) => {
          const selected = option === scheduledTime;
          return (
            <Pressable
              key={option}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setScheduledTime(option)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {formatTime(option)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>NOTE (OPTIONAL)</Text>
      <TextInput
        style={styles.note}
        value={note}
        onChangeText={(value) => setNote(value.slice(0, 300))}
        placeholder="Example: Alex wants to work on top position."
        placeholderTextColor={colors.textSecondary}
        multiline
        editable={!sending}
      />

      <Text style={styles.priceNote}>
        Standard {format.label.toLowerCase()} rate is ${format.price} — you only pay when the
        coach sends a booking link and you book.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.send, sending && styles.disabled]} onPress={() => void send()} disabled={sending}>
        {sending ? (
          <ActivityIndicator color={colors.black} />
        ) : (
          <Text style={styles.sendText}>
            Request {format.label} · {selectedDate ? selectedDate.long : ''} at {formatTime(scheduledTime)}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 12, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 30, marginBottom: 8 },
  intro: { ...typography.body, color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 18 },
  label: { ...typography.bodyBold, color: colors.textMuted, fontSize: 11, letterSpacing: 1, marginBottom: 8, marginTop: 14 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  typeButtonSelected: { borderColor: colors.accent, backgroundColor: colors.surface },
  typeTitle: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  typeTitleSelected: { color: colors.accent },
  typeDetail: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 3 },
  typeDetailSelected: { color: colors.accent },
  chipRow: { gap: 8, paddingRight: 20 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.surface },
  chipSmall: { ...typography.body, color: colors.textMuted, fontSize: 10 },
  chipText: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  chipTextSelected: { color: colors.accent },
  note: {
    ...typography.body,
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  priceNote: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 14 },
  error: { ...typography.body, color: colors.danger, fontSize: 13, marginTop: 12 },
  send: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 14,
  },
  sendText: { ...typography.bodyBold, color: colors.black, fontSize: 14, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
