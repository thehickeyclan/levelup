import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiFetch } from './api';
import { easProjectId } from './config';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let cachedToken: string | null = null;

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId =
    easProjectId() ??
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId: String(projectId) } : undefined
  );
  const token = tokenResponse.data;
  cachedToken = token;

  try {
    await apiFetch('/api/devices/push-token', {
      method: 'POST',
      body: JSON.stringify({
        expo_push_token: token,
        platform: Platform.OS === 'android' ? 'android' : 'ios',
      }),
    });
  } catch (e) {
    console.warn('Failed to register push token', e);
  }

  return token;
}

export async function unregisterPushToken(): Promise<void> {
  if (!cachedToken) return;
  try {
    await apiFetch('/api/devices/push-token', {
      method: 'DELETE',
      body: JSON.stringify({ expo_push_token: cachedToken }),
    });
  } catch {
    // ignore
  }
  cachedToken = null;
}

/** Notification payloads carry WEB paths in data.link — translate to app routes. */
function appRouteFromWebLink(link: string): string | null {
  const sessionMatch = link.match(/^\/sessions\/([0-9a-f-]{36})/i);
  if (sessionMatch) return `/booking/${sessionMatch[1]}`;
  const threadMatch = link.match(/[?&]thread=([0-9a-f-]{36})/i);
  if (threadMatch) return `/thread/${threadMatch[1]}`;
  const listingMatch = link.match(/^\/market\/listing\/([0-9a-f-]{36})/i);
  if (listingMatch) return `/listing/${listingMatch[1]}`;
  if (link.startsWith('/market/offers')) return '/market-offers';
  if (link.startsWith('/create-session')) return '/create-session';
  return null;
}

export function getNotificationDeepLink(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (typeof data.deep_link === 'string' && data.deep_link.startsWith('/')) {
    return data.deep_link;
  }
  if (data.availability_setup === true) return '/coach-availability-setup';
  if (typeof data.session_id === 'string') return `/booking/${data.session_id}`;
  if (typeof data.thread_id === 'string') return `/thread/${data.thread_id}`;
  if (typeof data.listing_id === 'string') return `/listing/${data.listing_id}`;
  if (typeof data.offer_id === 'string') return '/(tabs)/inbox';
  if (typeof data.order_id === 'string') return `/order/${data.order_id}`;
  if (typeof data.coach_id === 'string') return `/coach/${data.coach_id}`;
  if (typeof data.link === 'string') {
    const mapped = appRouteFromWebLink(data.link);
    if (mapped) return mapped;
  }
  return '/notifications';
}
