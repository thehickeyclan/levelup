import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { coachSessionTitle, type CoachSessionRow } from '@/lib/coach-data';
import { colors, typography } from '@/lib/theme';

type Props = {
  session: CoachSessionRow | null;
  onLater: () => void;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CoachSessionCloseoutReminder({ session, onLater }: Props) {
  const router = useRouter();

  function open(path: string) {
    onLater();
    router.push(path as never);
  }

  return (
    <Modal visible={Boolean(session)} transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        {session ? (
          <View style={styles.card}>
            <Text style={styles.kicker}>SESSION ENDED</Text>
            <Text style={styles.title}>How did it go?</Text>
            <Text style={styles.session}>{coachSessionTitle(session)}</Text>
            <Text style={styles.meta}>
              {formatWhen(session.scheduled_datetime)}
              {session.facilities?.name ? ` · ${session.facilities.name}` : ''}
            </Text>
            <Text style={styles.help}>
              Close it and record who attended. If the entire session did not happen, reschedule
              or cancel it.
            </Text>
            <Pressable
              style={styles.primary}
              onPress={() => open(`/coach-session-closeout/${session.id}`)}
            >
              <Text style={styles.primaryText}>Close out session</Text>
            </Pressable>
            <View style={styles.row}>
              <Pressable
                style={styles.secondary}
                onPress={() => open(`/coach-session-reschedule/${session.id}`)}
              >
                <Text style={styles.secondaryText}>Reschedule</Text>
              </Pressable>
              <Pressable
                style={styles.secondary}
                onPress={() => open(`/coach-session-closeout/${session.id}?action=cancel`)}
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </View>
            <Pressable style={styles.later} onPress={onLater}>
              <Text style={styles.laterText}>Remind me later</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 22,
  },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 12, marginBottom: 10 },
  title: { ...typography.display, color: colors.text, fontSize: 30, marginBottom: 12 },
  session: { ...typography.bodyBold, color: colors.text, fontSize: 18 },
  meta: { ...typography.body, color: colors.textMuted, fontSize: 14, marginTop: 5 },
  help: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginVertical: 18,
  },
  primary: {
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
  later: { alignItems: 'center', paddingTop: 18, paddingBottom: 2 },
  laterText: { ...typography.bodyMedium, color: colors.textMuted, fontSize: 14 },
});
