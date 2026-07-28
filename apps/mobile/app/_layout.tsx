import { useEffect } from 'react';
import { View } from 'react-native';
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
import { MobileCartProvider } from '@/lib/mobile-cart';

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
          backgroundColor: colors.black,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GuildLogo size={220} variant="mark" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <MobileCartProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.accent,
            headerTitleStyle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ title: 'Sign in', headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="coach/[id]" options={{ title: 'Coach' }} />
          <Stack.Screen name="coach-directory" options={{ title: 'Coach Directory' }} />
          <Stack.Screen name="coach-share" options={{ title: 'Share coaching page' }} />
          <Stack.Screen name="coach-public-availability/[id]" options={{ title: 'Public availability' }} />
          <Stack.Screen name="coach-map" options={{ title: 'Coach map' }} />
          <Stack.Screen name="book/[athleteId]" options={{ title: 'Book private' }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
          <Stack.Screen name="booking/[id]" options={{ title: 'Booking' }} />
          <Stack.Screen name="notifications" options={{ title: 'Alerts' }} />
          <Stack.Screen name="notification-settings" options={{ title: 'Notification settings' }} />
          <Stack.Screen name="thread/[id]" options={{ title: 'Messages' }} />
          <Stack.Screen name="new-message" options={{ title: 'New message' }} />
          <Stack.Screen name="session-message/[id]" options={{ title: 'Text roster' }} />
          <Stack.Screen name="coach-earnings" options={{ title: 'Earnings' }} />
          <Stack.Screen name="coach-athletes" options={{ title: 'My Athletes' }} />
          <Stack.Screen name="coach-athlete/[id]" options={{ title: 'Athlete' }} />
          <Stack.Screen name="coach-availability-setup" options={{ title: 'Normal week' }} />
          <Stack.Screen name="coach-availability-custom" options={{ title: 'Weekly availability' }} />
          <Stack.Screen name="select-coach" options={{ title: 'Select coach' }} />
          <Stack.Screen name="create-session" options={{ title: 'Create session' }} />
          <Stack.Screen name="coach-session-closeout/[id]" options={{ title: 'Close out session' }} />
          <Stack.Screen name="coach-session-reschedule/[id]" options={{ title: 'Reschedule session' }} />
          <Stack.Screen name="coach-locations" options={{ title: 'Training locations' }} />
          <Stack.Screen name="activity" options={{ title: 'Activity' }} />
          <Stack.Screen name="my-wrestlers" options={{ title: 'My wrestlers' }} />
          <Stack.Screen name="wrestler-edit/[id]" options={{ title: 'Wrestler profile' }} />
          <Stack.Screen name="my-coaches" options={{ title: 'My coaches' }} />
          <Stack.Screen name="wallet" options={{ title: 'Wallet' }} />
          <Stack.Screen name="coach-profile-edit" options={{ title: 'Coach profile' }} />
          <Stack.Screen name="coach-playbook" options={{ title: 'Coach Playbook' }} />
          <Stack.Screen name="coach-playbook-add" options={{ title: 'Share a coach tip' }} />
          <Stack.Screen name="listing/[id]" options={{ title: 'Listing' }} />
          <Stack.Screen name="my-market" options={{ title: 'My Market' }} />
          <Stack.Screen name="add-shoe" options={{ title: 'Add shoe' }} />
          <Stack.Screen name="manage-listing/[id]" options={{ title: 'Manage listing' }} />
          <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
        </Stack>
      </MobileCartProvider>
    </AuthProvider>
  );
}
