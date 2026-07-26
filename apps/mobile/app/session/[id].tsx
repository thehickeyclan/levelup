import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SessionDetailView, useSessionDetail } from '@/components/session-detail-view';
import { colors, typography } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { useMobileCart } from '@/lib/mobile-cart';

/**
 * Small-group detail: session info + roster. Register/pay still uses the web
 * checkout flow until native Payment Sheet is wired.
 */
export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isCoachView } = useAuth();
  const { addSession } = useMobileCart();
  const { session, roster, loading, error, load } = useSessionDetail(id);
  const [opening, setOpening] = useState(false);

  async function addToCart() {
    setOpening(true);
    try {
      await addSession(id);
      router.push('/(tabs)/cart');
    } catch (e) {
      Alert.alert('Could not add to cart', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setOpening(false);
      void load();
    }
  }

  const canJoin = session != null && session.status === 'scheduled' && session.openings > 0;

  return (
    <SessionDetailView
      session={session}
      roster={roster}
      loading={loading}
      error={error}
      onRefresh={() => void load()}
      footer={
        isCoachView && session ? (
          <>
            <Pressable style={styles.button} onPress={() => router.push('/new-message')}>
              <Text style={styles.buttonText}>Message parent or athlete</Text>
            </Pressable>
            {session.status === 'scheduled' && roster.length > 0 ? (
              <Pressable style={styles.secondaryButton} onPress={() => router.push(`/session-message/${id}`)}>
                <Text style={styles.secondaryButtonText}>Text session roster</Text>
              </Pressable>
            ) : null}
          </>
        ) : canJoin ? (
          <Pressable style={styles.button} onPress={() => void addToCart()} disabled={opening}>
            <Text style={styles.buttonText}>
              {opening ? 'Adding…' : 'Add a spot to cart'}
            </Text>
          </Pressable>
        ) : session ? (
          <Text style={styles.fullNote}>
            {session.status === 'scheduled'
              ? 'This session is full.'
              : 'Registration is closed for this session.'}
          </Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 15,
    letterSpacing: 0.4,
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { ...typography.bodyBold, color: colors.accent, fontSize: 15 },
  fullNote: {
    ...typography.bodyMedium,
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 20,
    textAlign: 'center',
  },
});
