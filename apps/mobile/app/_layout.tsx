import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { AuthProvider } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { getNotificationDeepLink } from '@/lib/push';
import { GuildLogo } from '@/components/guild-logo';

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
  });

  useEffect(() => {
    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse) {
      const data = initialResponse.notification.request.content.data as Record<string, unknown>;
      const href = getNotificationDeepLink(data);
      if (href) router.push(href as never);
    }

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const href = getNotificationDeepLink(data);
      if (href) router.push(href as never);
    });
    return () => sub.remove();
  }, [router]);

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <GuildLogo size={180} />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerTitleStyle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ title: 'Sign in', headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="coach/[id]" options={{ title: 'Coach' }} />
        <Stack.Screen name="coach-map" options={{ title: 'Coach map' }} />
        <Stack.Screen name="book/[athleteId]" options={{ title: 'Book private' }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
        <Stack.Screen name="booking/[id]" options={{ title: 'Booking' }} />
        <Stack.Screen name="notifications" options={{ title: 'Alerts' }} />
        <Stack.Screen name="thread/[id]" options={{ title: 'Messages' }} />
        <Stack.Screen name="new-message" options={{ title: 'New message' }} />
        <Stack.Screen name="listing/[id]" options={{ title: 'Listing' }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
      </Stack>
    </AuthProvider>
  );
}
