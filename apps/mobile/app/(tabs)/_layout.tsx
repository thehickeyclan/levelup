import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useNotificationRealtime } from '@/lib/use-notification-realtime';
import { colors, typography } from '@/lib/theme';
import { useMobileCart } from '@/lib/mobile-cart';

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      numberOfLines={1}
      style={{
        fontSize: 10,
        fontFamily: focused ? 'Inter_700Bold' : 'Inter_500Medium',
        color: focused ? colors.accent : colors.textSecondary,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const { session, loading, isCoachView } = useAuth();
  const { unreadCount } = useNotificationRealtime();
  const { count: cartCount } = useMobileCart();

  if (!loading && !session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { ...typography.bodySemi, color: colors.text },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarShowLabel: false,
        tabBarIconStyle: { width: '100%' },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingTop: 6,
          height: 64,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabLabel label="Home" focused={focused} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.black },
        }}
      />
      <Tabs.Screen
        name="find"
        options={{
          title: isCoachView ? 'Create' : 'Training',
          href: isCoachView ? null : undefined,
          tabBarIcon: ({ focused }) => <TabLabel label="Training" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: isCoachView ? 'Schedule' : 'Bookings',
          href: isCoachView ? undefined : null,
          tabBarIcon: ({ focused }) => (
            <TabLabel label={isCoachView ? 'Schedule' : 'Bookings'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ focused }) => <TabLabel label="Inbox" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ focused }) => <TabLabel label="Market" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          href: isCoachView ? null : undefined,
          tabBarIcon: ({ focused }) => <TabLabel label="Cart" focused={focused} />,
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.black },
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'More',
          tabBarIcon: ({ focused }) => <TabLabel label="More" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
