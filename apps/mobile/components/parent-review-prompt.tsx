import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

export type ParentReviewPrompt = {
  sessionId: string;
  coachId: string;
  coachName: string;
  scheduled_datetime: string;
  attendingAthletes: { id: string; first_name?: string; last_name?: string }[];
};

export function ParentReviewPromptModal({
  prompt,
  onDone,
}: {
  prompt: ParentReviewPrompt | null;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!prompt || rating < 1 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ sessionId: prompt.sessionId, rating, comment }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save review');
    } finally {
      setSaving(false);
    }
  }

  async function dismiss() {
    if (!prompt || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/parent/reviews/dismiss', {
        method: 'POST',
        body: JSON.stringify({ athleteId: prompt.coachId }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not dismiss');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={Boolean(prompt)} transparent animationType="fade" onRequestClose={() => void dismiss()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>QUICK REVIEW</Text>
          <Text style={styles.title}>How was training with {prompt?.coachName}?</Text>
          <Text style={styles.meta}>Your feedback helps other wrestling families.</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setRating(star)} hitSlop={8}>
                <Text style={[styles.star, star <= rating && styles.starActive]}>★</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Optional note"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={500}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.submit, rating < 1 && styles.disabled]} onPress={() => void submit()} disabled={saving || rating < 1}>
            {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.submitText}>Submit review</Text>}
          </Pressable>
          <Pressable style={styles.dismiss} onPress={() => void dismiss()} disabled={saving}>
            <Text style={styles.dismissText}>Not now — don&apos;t ask again</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: 22 },
  card: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 8, padding: 20 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 8 },
  title: { ...typography.display, color: colors.text, fontSize: 24, lineHeight: 30 },
  meta: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 7 },
  stars: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 18 },
  star: { fontSize: 38, color: colors.border },
  starActive: { color: colors.accent },
  input: { ...typography.body, color: colors.text, minHeight: 86, borderWidth: 1, borderColor: colors.border, padding: 12, textAlignVertical: 'top' },
  error: { ...typography.body, color: colors.danger, marginTop: 10 },
  submit: { minHeight: 50, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderRadius: 4, marginTop: 14 },
  disabled: { opacity: 0.45 },
  submitText: { ...typography.bodyBold, color: colors.black },
  dismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  dismissText: { ...typography.bodyMedium, color: colors.textSecondary, fontSize: 12 },
});
