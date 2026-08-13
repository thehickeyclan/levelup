import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { apiFetch } from './api';

const HIDDEN_THREADS_KEY = 'guild.hiddenThreads';

/** Threads the user has blocked — hidden from their inbox on this device. */
export async function getHiddenThreadIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_THREADS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function hideThread(threadId: string): Promise<void> {
  const current = await getHiddenThreadIds();
  current.add(threadId);
  await AsyncStorage.setItem(HIDDEN_THREADS_KEY, JSON.stringify([...current]));
}

export type ReportTarget = 'listing' | 'thread' | 'message' | 'user' | 'activity';

/** Report flow shared by listing/thread screens: confirm, send, acknowledge. */
export function reportContent(
  targetType: ReportTarget,
  targetId: string,
  options?: { onDone?: () => void; extraAction?: { label: string; run: () => Promise<void> } }
) {
  const send = (reason: string, after?: () => void) => {
    void (async () => {
      try {
        await apiFetch('/api/mobile/report', {
          method: 'POST',
          body: JSON.stringify({ targetType, targetId, reason }),
        });
        Alert.alert(
          'Report received',
          'Thanks — Guild staff review every report within 24 hours and remove content that breaks the rules.'
        );
        after?.();
        options?.onDone?.();
      } catch {
        Alert.alert('Could not send report', 'Please try again in a moment.');
      }
    })();
  };

  const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Inappropriate content', onPress: () => send('Inappropriate content') },
    { text: 'Spam or scam', onPress: () => send('Spam or scam') },
  ];
  if (options?.extraAction) {
    const extra = options.extraAction;
    buttons.push({
      text: extra.label,
      style: 'destructive',
      onPress: () =>
        send('Blocked by user', () => {
          void extra.run();
        }),
    });
  }
  Alert.alert('Report this content?', 'Tell us what is wrong and Guild staff will review it.', buttons);
}
