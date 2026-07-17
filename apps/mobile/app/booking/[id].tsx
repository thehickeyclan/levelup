import { Pressable, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { SessionDetailView, useSessionDetail } from '@/components/session-detail-view';
import { WEB_ORIGIN } from '@/lib/config';
import { colors, typography } from '@/lib/theme';

/** Booking detail: session info + who's on the roster. Cancel/manage stays on web. */
export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, roster, loading, error, load } = useSessionDetail(id);

  return (
    <SessionDetailView
      session={session}
      roster={roster}
      loading={loading}
      error={error}
      onRefresh={() => void load()}
      footer={
        <Pressable
          style={styles.button}
          onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/sessions/${id}`)}
        >
          <Text style={styles.buttonText}>Manage on web</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.bodyBold,
    color: colors.accent,
    fontSize: 15,
    letterSpacing: 0.4,
  },
});
