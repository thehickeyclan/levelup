import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

export type ReviewPrompt = {
  sessionId: string;
  scheduled_datetime: string;
  session_type: string | null;
  coachId: string;
  coachName: string;
  attendingAthletes: { id: string; first_name?: string; last_name?: string }[];
};

export function usePendingReviews() {
  const [prompts, setPrompts] = useState<ReviewPrompt[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch<{ prompts: ReviewPrompt[] }>('/api/mobile/reviews/pending');
      setPrompts(res.prompts ?? []);
    } catch {
      // Home stays usable if the prompt fetch fails; next focus retries.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return { prompts, loading, refresh };
}

function Star({ filled, onPress }: { filled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={[styles.star, filled && styles.starFilled]}>{filled ? '★' : '☆'}</Text>
    </Pressable>
  );
}

export function ReviewPromptCard({
  prompt,
  onDone,
}: {
  prompt: ReviewPrompt;
  /** Called after submit or dismiss so the parent list refreshes (card disappears). */
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  const when = new Date(prompt.scheduled_datetime).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const kids = prompt.attendingAthletes
    .map((a) => a.first_name)
    .filter(Boolean)
    .join(' & ');

  async function submit() {
    if (rating < 1) {
      setError('Tap a star rating first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: prompt.sessionId,
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      setThanks(true);
      setTimeout(() => {
        setOpen(false);
        onDone();
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/parent/reviews/dismiss', {
        method: 'POST',
        body: JSON.stringify({ athleteId: prompt.coachId }),
      });
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Pressable style={styles.card} onPress={() => setOpen(true)}>
        <Text style={styles.cardKicker}>LEAVE A REVIEW</Text>
        <Text style={styles.cardTitle}>How was {kids ? `${kids}'s` : 'your'} first session
          {' '}with {prompt.coachName}?</Text>
        <Text style={styles.cardMeta}>{when} · Tap to rate</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {thanks ? (
              <Text style={styles.thanks}>Thanks — your review is in.</Text>
            ) : (
              <>
                <Text style={styles.sheetKicker}>REVIEW</Text>
                <Text style={styles.sheetTitle}>{prompt.coachName}</Text>
                <Text style={styles.sheetMeta}>
                  {kids ? `${kids} · ` : ''}
                  {when}
                </Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} filled={n <= rating} onPress={() => setRating(n)} />
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Anything the Guild should know? (optional)"
                  placeholderTextColor={colors.textSecondary}
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  maxLength={500}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable style={styles.submit} onPress={() => void submit()} disabled={busy}>
                  {busy ? (
                    <ActivityIndicator color={colors.black} />
                  ) : (
                    <Text style={styles.submitText}>Submit review</Text>
                  )}
                </Pressable>
                <Pressable style={styles.dismiss} onPress={() => void dismiss()} disabled={busy}>
                  <Text style={styles.dismissText}>Not now</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    padding: 16,
    marginBottom: 10,
  },
  cardKicker: { ...typography.brand, fontSize: 10, color: colors.accent, marginBottom: 6 },
  cardTitle: { ...typography.bodySemi, fontSize: 15, color: colors.text, lineHeight: 21 },
  cardMeta: { ...typography.body, fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 20,
  },
  sheetKicker: { ...typography.brand, fontSize: 10, color: colors.accent },
  sheetTitle: { ...typography.display, fontSize: 24, color: colors.text, marginTop: 6 },
  sheetMeta: { ...typography.body, fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  stars: { flexDirection: 'row', gap: 10, marginVertical: 16 },
  star: { fontSize: 34, color: colors.textSecondary },
  starFilled: { color: colors.accent },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    minHeight: 72,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  error: { ...typography.body, color: colors.danger, fontSize: 13, marginTop: 10 },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  dismiss: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  dismissText: { ...typography.bodyMedium, color: colors.textSecondary, fontSize: 14 },
  thanks: { ...typography.bodySemi, fontSize: 16, color: colors.text, textAlign: 'center', padding: 12 },
});
