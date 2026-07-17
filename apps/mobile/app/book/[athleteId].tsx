import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { WEB_ORIGIN } from '@/lib/config';
import { colors, typography } from '@/lib/theme';

/**
 * Full private booking (facility, wrestlers, Stripe) remains on the mobile web flow
 * until native Payment Sheet is wired. Deep-link opens the authenticated booking page.
 */
export default function BookPrivateScreen() {
  const { athleteId } = useLocalSearchParams<{ athleteId: string }>();
  const [opening, setOpening] = useState(false);

  async function openBooking() {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/book/${athleteId}`);
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>PRIVATE</Text>
      <Text style={styles.title}>Book a private</Text>
      <Text style={styles.body}>
        Choose your wrestler, time, and facility, then pay securely. Prefer a group? Join an open
        small group from Train — that&apos;s the main product.
      </Text>
      <Pressable style={styles.button} onPress={() => void openBooking()} disabled={opening}>
        <Text style={styles.buttonText}>{opening ? 'Opening…' : 'Continue to booking'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 12, backgroundColor: colors.background },
  kicker: { ...typography.brand, fontSize: 11, color: colors.accent },
  title: { ...typography.display, fontSize: 28, color: colors.text },
  body: { ...typography.body, fontSize: 15, lineHeight: 22, color: colors.textMuted },
  button: {
    marginTop: 12,
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
});
