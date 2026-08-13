import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type MarketItem = {
  id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  size?: number | null;
  status?: string;
  listing_type?: string;
  price_cents?: number | null;
  primary_image_url?: string | null;
  condition_label?: string | null;
  pending_offer_count?: number;
  open_to_trade?: boolean | null;
};
type Order = {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_image_url?: string | null;
  status: string;
  amount_cents: number;
  is_buyer: boolean;
};
type TradeHistory = {
  id: string;
  status: string;
  boot_amount_cents: number;
  other_party_name?: string | null;
  your_listing?: {
    title: string;
    size?: number | null;
    image_url?: string | null;
  } | null;
  their_listing?: {
    title: string;
    size?: number | null;
    image_url?: string | null;
  } | null;
};
type Payload = {
  groups: {
    pairs: MarketItem[];
    soldTraded: MarketItem[];
    drafts: MarketItem[];
    archived: MarketItem[];
  };
  watching: MarketItem[];
  orders: Order[];
  trades?: TradeHistory[];
};
type Tab = 'watching' | 'mine' | 'selling' | 'history';

export default function MyMarketScreen() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiFetch<Payload>('/api/market/my'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load My Market');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const items = useMemo(() => {
    const active = data?.groups.pairs ?? [];
    if (tab === 'watching') return data?.watching ?? [];
    if (tab === 'mine') return [...active, ...(data?.groups.drafts ?? [])];
    if (tab === 'selling') {
      return [
        ...active.filter((item) =>
          item.listing_type === 'sell' ||
          item.listing_type === 'trade' ||
          item.listing_type === 'trade_only' ||
          item.open_to_trade === true
        ),
        ...(data?.groups.drafts ?? []),
      ];
    }
    return [];
  }, [data, tab]);

  if (loading && !data) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  const tabs: [Tab, string][] = [
    ['mine', 'My shoes'],
    ['watching', 'Favorites'],
    ['selling', 'Selling / trade'],
    ['history', 'History'],
  ];

  return (
    <FlatList
      style={styles.screen}
      data={tab === 'history' ? [] : items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>MY MARKET</Text>
              <Text style={styles.heading}>Your shoe room</Text>
              <Text style={styles.sub}>Favorite, collect, sell, and trade in one place.</Text>
            </View>
            <Pressable
              style={styles.addButton}
              onPress={() => router.push({ pathname: '/add-shoe', params: { mode: 'collection' } })}
            >
              <Text style={styles.addButtonText}>+ Add shoe</Text>
            </Pressable>
          </View>
          <View style={styles.quickActions}>
            <Pressable
              style={styles.quickActionPrimary}
              onPress={() => router.push({ pathname: '/add-shoe', params: { mode: 'sell' } })}
            >
              <Text style={styles.quickTitle}>List a pair</Text>
              <Text style={styles.quickMeta}>Photos · price · offers</Text>
            </Pressable>
            <Pressable
              style={styles.quickAction}
              onPress={() => router.push({ pathname: '/add-shoe', params: { mode: 'trade' } })}
            >
              <Text style={styles.quickTitleAlt}>Open to trade</Text>
              <Text style={styles.quickMeta}>Trade or trade + cash</Text>
            </Pressable>
          </View>
          <Pressable style={styles.offersButton} onPress={() => router.push('/market-offers')}>
            <Text style={styles.offersButtonText}>Offers</Text>
            <Text style={styles.offersButtonMeta}>Review bids you received or sent</Text>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {tabs.map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.tab, tab === value && styles.tabSelected]}
                onPress={() => setTab(value)}
              >
                <Text style={[styles.tabText, tab === value && styles.tabTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {tab === 'history' ? (
            <View style={styles.orders}>
              {(data?.orders ?? []).map((order) => (
                <Pressable key={order.id} style={styles.row} onPress={() => router.push(`/order/${order.id}`)}>
                  {order.listing_image_url ? <Image source={{ uri: order.listing_image_url }} style={styles.thumb} resizeMode="contain" /> : <View style={styles.thumb} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{order.listing_title}</Text>
                    <Text style={styles.itemMeta}>
                      {order.is_buyer ? 'Purchase' : 'Sale'} · {order.status.replaceAll('_', ' ')}
                    </Text>
                  </View>
                  <Text style={styles.price}>${Math.round(order.amount_cents / 100)}</Text>
                </Pressable>
              ))}
              {(data?.trades ?? []).map((trade) => (
                <Pressable key={trade.id} style={styles.row} onPress={() => router.push(`/market-trade/${trade.id}`)}>
                  {trade.their_listing?.image_url ? (
                    <Image source={{ uri: trade.their_listing.image_url }} style={styles.thumb} resizeMode="contain" />
                  ) : (
                    <View style={styles.thumb} />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      Trade with {trade.other_party_name ?? 'Guild member'}
                    </Text>
                    <Text style={styles.itemMeta} numberOfLines={2}>
                      {trade.your_listing?.title ?? 'Your pair'} ↔ {trade.their_listing?.title ?? 'Their pair'} · {trade.status.replaceAll('_', ' ')}
                    </Text>
                  </View>
                  <Text style={styles.price}>
                    {trade.boot_amount_cents > 0 ? `+$${Math.round(trade.boot_amount_cents / 100)}` : 'Trade'}
                  </Text>
                </Pressable>
              ))}
              {(data?.orders ?? []).length === 0 && (data?.trades ?? []).length === 0 ? <Empty tab={tab} /> : null}
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => router.push(`/listing/${item.id}`)}>
          {item.primary_image_url ? <Image source={{ uri: item.primary_image_url }} style={styles.thumb} resizeMode="contain" /> : <View style={styles.thumb} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.model || item.title}</Text>
            <Text style={styles.itemMeta}>
              {[item.size ? `Size ${item.size}` : null, item.condition_label, item.status].filter(Boolean).join(' · ')}
            </Text>
            {(item.pending_offer_count ?? 0) > 0 ? (
              <Text style={styles.offer}>{item.pending_offer_count} pending offer{item.pending_offer_count === 1 ? '' : 's'}</Text>
            ) : null}
          </View>
          <Text style={styles.price}>{item.price_cents != null ? `$${Math.round(item.price_cents / 100)}` : 'View'}</Text>
        </Pressable>
      )}
      ListEmptyComponent={tab !== 'history' ? <Empty tab={tab} /> : null}
    />
  );
}


function Empty({ tab }: { tab: Tab }) {
  const copy =
    tab === 'watching'
      ? 'Tap Favorite on a shoe to save it here and get alerts when it goes for sale.'
      : tab === 'mine'
        ? 'Add shoes you own. Keep them as collection pieces, list them for sale, or open them to trade.'
        : tab === 'selling'
          ? 'Pairs you are selling or trading will appear here.'
          : 'Purchases, sales, trades, and reviews will appear here.';
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.emptyText}>{copy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 7 },
  heading: { ...typography.display, color: colors.text, fontSize: 27 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 5 },
  addButton: { backgroundColor: colors.accent, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 11 },
  addButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 11 },
  quickActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  quickActionPrimary: { flex: 1, borderRadius: 13, backgroundColor: colors.accent, padding: 13, minHeight: 72, justifyContent: 'center' },
  quickAction: { flex: 1, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 13, minHeight: 72, justifyContent: 'center' },
  quickTitle: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  quickTitleAlt: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  quickMeta: { ...typography.body, color: colors.textSecondary, fontSize: 10, marginTop: 5 },
  challengeCard: { marginTop: 12, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(184,157,96,0.38)', backgroundColor: 'rgba(184,157,96,0.10)', padding: 13 },
  challengeKicker: { ...typography.brand, color: colors.accent, fontSize: 9, marginBottom: 6 },
  challengeTitle: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  challengeText: { ...typography.body, color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  challengeTrack: { height: 7, borderRadius: 999, backgroundColor: colors.surface, overflow: 'hidden', marginTop: 10 },
  challengeFill: { height: '100%', borderRadius: 999, backgroundColor: colors.accent },
  challengeCount: { ...typography.bodySemi, color: colors.accent, fontSize: 10, marginTop: 7 },
  offersButton: { marginTop: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 13, padding: 13 },
  offersButtonText: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  offersButtonMeta: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 4 },
  tabs: { gap: 7, paddingVertical: 18 },
  tab: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  tabSelected: { borderColor: colors.accent, backgroundColor: 'rgba(184,157,96,0.14)' },
  tabText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 10 },
  tabTextSelected: { color: colors.accent },
  row: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12 },
  thumb: { width: 66, height: 66, borderRadius: 9, backgroundColor: colors.surface },
  itemTitle: { ...typography.bodySemi, color: colors.text, fontSize: 14 },
  itemMeta: { ...typography.body, color: colors.textMuted, fontSize: 10, marginTop: 4, textTransform: 'capitalize' },
  offer: { ...typography.bodySemi, color: colors.accent, fontSize: 10, marginTop: 5 },
  price: { ...typography.bodyBold, color: colors.accent, fontSize: 13 },
  orders: { marginBottom: 8 },
  empty: { alignItems: 'center', paddingVertical: 52, paddingHorizontal: 28 },
  emptyTitle: { ...typography.bodySemi, color: colors.text, fontSize: 16 },
  emptyText: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginBottom: 10 },
});
