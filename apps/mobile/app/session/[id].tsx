import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { SessionDetailView, useSessionDetail } from '@/components/session-detail-view';
import { WEB_ORIGIN } from '@/lib/config';
import { colors, typography } from '@/lib/theme';

/**
 * Small-group detail: session info + roster. Register/pay still uses the web
 * checkout flow until native Payment Sheet is wired.
 */
export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, roster, loading, error, load } = useSessionDetail(id);
  const [opening, setOpening] = useState(false);

  async function openRegister() {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/sessions/${id}/register`);
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
        canJoin ? (
          <Pressable style={styles.button} onPress={() => void openRegister()} disabled={opening}>
            <Text style={styles.buttonText}>
              {opening ? 'Opening…' : 'Join this session'}
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
  fullNote: {
    ...typography.bodyMedium,
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 20,
    textAlign: 'center',
  },
});
