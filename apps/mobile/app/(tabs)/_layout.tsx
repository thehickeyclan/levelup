import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';
import { useMobileCart } from '@/lib/mobile-cart';
import { useInboxUnreadRealtime } from '@/lib/use-inbox-unread-realtime';

function TabLabel({
  label,
  focused,
  badge,
}: {
  label: string;
  focused: boolean;
  badge?: number;
}) {
  return (
    <View style={styles.tabLabelWrap}>
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
      {badge && badge > 0 ? (
        <View style={styles.inboxBadge}>
          <Text style={styles.inboxBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const { session, loading, isCoachView } = useAuth();
  const { count: cartCount } = useMobileCart();
  const { count: inboxUnreadCount } = useInboxUnreadRealtime();
  const router = useRouter();
  const pathname = usePathname();

  if (!loading && !session) return <Redirect href="/(auth)/login" />;

  const showFloatingCart = !isCoachView && cartCount > 0 && !pathname.endsWith('/cart');

  return (
    <View style={styles.root}>
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
          tabBarIcon: ({ focused }) => (
            <TabLabel label="Inbox" focused={focused} badge={inboxUnreadCount} />
          ),
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
          href: null,
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
      {showFloatingCart ? (
        <Pressable
          style={styles.floatingCart}
          onPress={() => router.push('/(tabs)/cart')}
          accessibilityRole="button"
          accessibilityLabel={`Open Training Cart with ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
        >
          <Text style={styles.floatingCartText}>Cart</Text>
          <View style={styles.cartCount}>
            <Text style={styles.cartCountText}>{cartCount}</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  tabLabelWrap: { minWidth: 48, height: 28, alignItems: 'center', justifyContent: 'center' },
  inboxBadge: {
    position: 'absolute',
    right: -2,
    top: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxBadgeText: { ...typography.bodyBold, color: colors.black, fontSize: 8 },
  floatingCart: {
    position: 'absolute',
    right: 16,
    bottom: 74,
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.black,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingCartText: { ...typography.bodyBold, color: colors.black, fontSize: 13 },
  cartCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCountText: { ...typography.bodyBold, color: colors.accent, fontSize: 11 },
});
