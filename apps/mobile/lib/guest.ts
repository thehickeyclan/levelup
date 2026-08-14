import { Alert } from 'react-native';
import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/** Guests can browse; acting requires an account. One consistent prompt. */
export function promptSignIn(router: Router, action = 'do that') {
  Alert.alert('Join the Guild', `Create a free account or sign in to ${action}.`, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Sign in', onPress: () => router.push('/(auth)/login') },
    { text: 'Create account', onPress: () => router.push('/(auth)/signup') },
  ]);
}
