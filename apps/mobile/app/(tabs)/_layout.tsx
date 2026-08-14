import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { colors, marketColors, typography } from '@/lib/theme';
import { useMobileCart } from '@/lib/mobile-cart';
import { useInboxUnreadRealtime } from '@/lib/use-inbox-unread-realtime';
import { BADGE_TEXT_MAX_SCALE, MIN_TOUCH_TARGET, NAV_TEXT_MAX_SCALE } from '@/lib/accessibility';

function TabLabel({
  label,
  icon,
  focused,
  badge,
  lightMode = false,
}: {
  label: string;
  icon: string;
  focused: boolean;
  badge?: number;
  lightMode?: boolean;
}) {
  const color = focused ? colors.accent : lightMode ? marketColors.textMuted : colors.textSecondary;
  return (
    <View style={styles.tabLabelWrap}>
      <Ionicons
        name={(focused ? icon : `${icon}-outline`) as keyof typeof Ionicons.glyphMap}
        size={22}
        color={color}
      />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={NAV_TEXT_MAX_SCALE}
        style={{
          fontSize: 10,
          fontFamily: focused ? 'Inter_700Bold' : 'Inter_500Medium',
          color,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
      {badge && badge > 0 ? (
        <View
          style={[
            styles.inboxBadge,
            { borderColor: lightMode ? marketColors.background : colors.background },
          ]}
        >
          <Text maxFontSizeMultiplier={BADGE_TEXT_MAX_SCALE} style={styles.inboxBadgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
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
  const isMarketTab = pathname === '/market';

  // Guests may browse the Market tab; every other tab requires an account.
  const isGuest = !loading && !session;

  const showFloatingCart = !isCoachView && cartCount > 0 && !pathname.endsWith('/cart');

  return (
    <View style={[styles.root, isMarketTab && styles.rootMarket]}>
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: isMarketTab ? marketColors.background : colors.background,
          },
          headerTintColor: isMarketTab ? marketColors.text : colors.accent,
          headerTitleStyle: {
            ...typography.bodySemi,
            color: isMarketTab ? marketColors.text : colors.text,
          },
          headerShadowVisible: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarShowLabel: false,
          tabBarIconStyle: { width: '100%' },
          tabBarItemStyle: { minHeight: MIN_TOUCH_TARGET },
          tabBarStyle: {
            backgroundColor: isMarketTab ? marketColors.background : colors.background,
            borderTopColor: isMarketTab ? marketColors.border : colors.border,
            borderTopWidth: 1,
            paddingTop: 6,
            minHeight: 72,
          },
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          href: isGuest ? null : undefined,
          tabBarAccessibilityLabel: 'Home tab',
          tabBarIcon: ({ focused }) => <TabLabel label="Home" icon="home" focused={focused} lightMode={isMarketTab} />,
        }}
      />
      <Tabs.Screen
        name="find"
        options={{
          title: isCoachView ? 'Create' : 'Training',
          href: isGuest || isCoachView ? null : undefined,
          tabBarAccessibilityLabel: 'Training tab',
          tabBarIcon: ({ focused }) => <TabLabel label="Training" icon="barbell" focused={focused} lightMode={isMarketTab} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: isCoachView ? 'Schedule' : 'Bookings',
          href: isGuest || !isCoachView ? null : undefined,
          tabBarAccessibilityLabel: isCoachView ? 'Schedule tab' : 'Bookings tab',
          tabBarIcon: ({ focused }) => (
            <TabLabel label={isCoachView ? 'Schedule' : 'Bookings'} icon="calendar" focused={focused} lightMode={isMarketTab} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          href: isGuest ? null : undefined,
          tabBarAccessibilityLabel: inboxUnreadCount > 0
            ? `Inbox tab, ${inboxUnreadCount} unread`
            : 'Inbox tab',
          tabBarIcon: ({ focused }) => (
            <TabLabel label="Inbox" icon="chatbubbles" focused={focused} badge={inboxUnreadCount} lightMode={isMarketTab} />
          ),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarAccessibilityLabel: 'Market tab',
          tabBarIcon: ({ focused }) => <TabLabel label="Market" icon="storefront" focused={focused} lightMode={isMarketTab} />,
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
          href: isGuest ? null : undefined,
          tabBarAccessibilityLabel: 'More tab',
          tabBarIcon: ({ focused }) => <TabLabel label="More" icon="menu" focused={focused} lightMode={isMarketTab} />,
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
          <Text maxFontSizeMultiplier={NAV_TEXT_MAX_SCALE} style={styles.floatingCartText}>Cart</Text>
          <View style={styles.cartCount}>
            <Text maxFontSizeMultiplier={BADGE_TEXT_MAX_SCALE} style={styles.cartCountText}>{cartCount}</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  rootMarket: { backgroundColor: marketColors.background },
  tabLabelWrap: { minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2 },
  inboxBadge: {
    position: 'absolute',
    right: -2,
    top: -4,
    minWidth: 17,
    minHeight: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxBadgeText: { ...typography.bodyBold, color: colors.black, fontSize: 8 },
  floatingCart: {
    position: 'absolute',
    right: 16,
    bottom: 82,
    minHeight: MIN_TOUCH_TARGET,
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
    minHeight: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartCountText: { ...typography.bodyBold, color: colors.accent, fontSize: 11 },
});
