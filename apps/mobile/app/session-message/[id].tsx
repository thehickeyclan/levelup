import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

export default function SessionMessageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'parents' | 'athletes' | 'both'>('parents');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!id || !message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch(`/api/sessions/${id}/sms-group`, {
        method: 'POST',
        body: JSON.stringify({ message: message.trim(), audience }),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send text');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.kicker}>SESSION TEXT</Text>
      <Text style={styles.heading}>Message the roster</Text>
      <Text style={styles.intro}>Send a text only to people registered for this session.</Text>
      <View style={styles.segment}>
        {(['parents', 'athletes', 'both'] as const).map((item) => (
          <Pressable
            key={item}
            style={[styles.segmentButton, audience === item && styles.segmentActive]}
            onPress={() => setAudience(item)}
          >
            <Text style={[styles.segmentText, audience === item && styles.segmentTextActive]}>
              {item === 'both' ? 'Both' : item[0].toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder="Practice reminder, location update…"
        placeholderTextColor={colors.textSecondary}
        multiline
        maxLength={1200}
        style={styles.input}
      />
      <Text style={styles.count}>{message.length}/1200</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.send} onPress={() => void send()} disabled={sending || !message.trim()}>
        {sending ? <ActivityIndicator color={colors.black} /> : <Text style={styles.sendText}>Send text</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 20 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 28 },
  intro: { ...typography.body, color: colors.textMuted, marginTop: 6, marginBottom: 18 },
  segment: { flexDirection: 'row', gap: 6 },
  segmentButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  segmentActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { ...typography.bodySemi, color: colors.textSecondary, fontSize: 12 },
  segmentTextActive: { color: colors.black },
  input: { ...typography.body, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 150, marginTop: 16, padding: 14, textAlignVertical: 'top' },
  count: { ...typography.body, color: colors.textSecondary, fontSize: 11, textAlign: 'right', marginTop: 5 },
  error: { ...typography.body, color: colors.danger, marginTop: 10 },
  send: { backgroundColor: colors.accent, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderRadius: 4 },
  sendText: { ...typography.bodyBold, color: colors.black },
});
