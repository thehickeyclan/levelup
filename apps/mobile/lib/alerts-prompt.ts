import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications } from '@/lib/push';

const PROMPTED_KEY = 'guild_alerts_prompted_v1';

/**
 * One-time ask to turn on push alerts. Fires after signup and once per
 * install for signed-in users; declining never re-prompts (they can enable
 * later in More → Enable push alerts).
 */
export async function promptForPushAlerts(force = false): Promise<void> {
  try {
    if (!force) {
      const seen = await AsyncStorage.getItem(PROMPTED_KEY);
      if (seen) return;
    }
    await AsyncStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    /* storage unavailable — still show the prompt */
  }

  Alert.alert(
    'Know first',
    'Turn on alerts to hear the moment your favorite shoes drop in price or sell, plus session updates from your coaches.',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Turn on alerts',
        onPress: () => {
          void registerForPushNotifications().catch(() => {});
        },
      },
    ]
  );
}
