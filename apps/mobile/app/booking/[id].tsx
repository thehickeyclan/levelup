import { Pressable, StyleSheet, Text, View } from 'react-native';
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
        <View>
          {session?.status === 'completed' ? (
            <Pressable
              style={styles.reviewButton}
              onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/sessions/${id}/review`)}
            >
              <Text style={styles.reviewButtonText}>Leave a review</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.button}
            onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/sessions/${id}`)}
          >
            <Text style={styles.buttonText}>Manage booking</Text>
          </Pressable>
        </View>
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
  reviewButton: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewButtonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 15,
  },
});
