import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { apiFetch } from '@/lib/api';
import { notifyMarketAttentionChanged } from '@/lib/use-market-attention';
import { marketColors as colors, typography } from '@/lib/theme';

type Item = {
  key: string;
  kind: 'offer_in' | 'offer_pay' | 'offer_out' | 'order' | 'trade';
  title: string;
  image_url: string | null;
  line: string;
  status: string;
  amount_cents: number | null;
  listing_id: string | null;
  offer_id?: string;
  order_id?: string;
  trade_id?: string;
};

type Payload = { needs_you: Item[]; waiting: Item[]; done: Item[] };

/** Everything in motion on the marketplace, one feed: decide, track, done. */
export default function MarketActivityScreen() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiFetch<Payload>('/api/market/activity'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function run(key: string, fn: () => Promise<void>) {
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    try {
      await fn();
      notifyMarketAttentionChanged();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through');
    } finally {
      setBusyKey(null);
    }
  }

  function respond(item: Item, action: 'accept' | 'decline') {
    void run(item.key, async () => {
      await apiFetch(`/api/market/offers/${item.offer_id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      Alert.alert(action === 'accept' ? 'Offer accepted' : 'Offer declined', 'The buyer has been notified.');
    });
  }

  function withdraw(item: Item) {
    Alert.alert('Withdraw this offer?', 'The seller is notified and the offer can no longer be accepted.', [
      { text: 'Keep offer', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () =>
          void run(item.key, async () => {
            await apiFetch(`/api/market/offers/${item.offer_id}`, {
              method: 'PATCH',
              body: JSON.stringify({ action: 'withdraw' }),
            });
          }),
      },
    ]);
  }

  function pay(item: Item) {
    void run(item.key, async () => {
      const result = await apiFetch<{ checkoutUrl?: string }>('/api/market/checkout', {
        method: 'POST',
        body: JSON.stringify({ listingId: item.listing_id, orderId: item.order_id }),
      });
      if (!result.checkoutUrl) throw new Error('Could not start secure checkout');
      await WebBrowser.openBrowserAsync(result.checkoutUrl);
    });
  }

  function openItem(item: Item) {
    if (item.kind === 'trade' && item.trade_id) return router.push(`/market-trade/${item.trade_id}`);
    if (item.kind === 'order' && item.order_id) return router.push(`/order/${item.order_id}`);
    if (item.listing_id) return router.push(`/listing/${item.listing_id}`);
  }

  function Card({ item, inNeedsYou }: { item: Item; inNeedsYou: boolean }) {
    const busy = busyKey === item.key;
    return (
      <View style={[styles.card, inNeedsYou && styles.cardNeedsYou]}>
        <Pressable style={styles.cardMain} onPress={() => openItem(item)}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.thumb} resizeMode="contain" />
          ) : (
            <View style={styles.thumb} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.cardLine} numberOfLines={2}>{item.line}</Text>
          </View>
        </Pressable>
        {inNeedsYou && item.kind === 'offer_in' ? (
          <View style={styles.actionRow}>
            <Pressable style={[styles.action, styles.actionQuiet]} onPress={() => respond(item, 'decline')} disabled={busy}>
              <Text style={styles.actionQuietText}>Decline</Text>
            </Pressable>
            <Pressable style={[styles.action, styles.actionGold]} onPress={() => respond(item, 'accept')} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.actionGoldText}>Accept</Text>}
            </Pressable>
          </View>
        ) : null}
        {inNeedsYou && item.kind === 'offer_pay' ? (
          <Pressable style={[styles.actionFull, styles.actionGold]} onPress={() => pay(item)} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.actionGoldText}>Pay now</Text>}
          </Pressable>
        ) : null}
        {inNeedsYou && (item.kind === 'order' || item.kind === 'trade') ? (
          <Pressable style={[styles.actionFull, styles.actionOutline]} onPress={() => openItem(item)}>
            <Text style={styles.actionOutlineText}>{item.kind === 'trade' ? 'Respond to trade' : 'Open order'}</Text>
          </Pressable>
        ) : null}
        {!inNeedsYou && item.kind === 'offer_out' && item.status === 'pending' ? (
          <Pressable style={[styles.actionFull, styles.actionOutline]} onPress={() => withdraw(item)} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.actionOutlineText}>Withdraw offer</Text>}
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const needsYou = data?.needs_you ?? [];
  const waiting = data?.waiting ?? [];
  const doneItems = data?.done ?? [];
  const empty = needsYou.length === 0 && waiting.length === 0 && doneItems.length === 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <Text style={styles.kicker}>MARKET</Text>
      <Text style={styles.heading}>Activity</Text>
      <Text style={styles.sub}>Every offer, order, and trade in one place.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {empty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing in motion</Text>
          <Text style={styles.emptyText}>
            Offers you make or receive, orders, and trades will all show up here.
          </Text>
        </View>
      ) : null}

      {needsYou.length > 0 ? (
        <View>
          <Text style={[styles.section, styles.sectionNeedsYou]}>NEEDS YOU</Text>
          {needsYou.map((item) => (
            <Card key={item.key} item={item} inNeedsYou />
          ))}
        </View>
      ) : null}

      {waiting.length > 0 ? (
        <View>
          <Text style={styles.section}>WAITING ON THEM</Text>
          {waiting.map((item) => (
            <Card key={item.key} item={item} inNeedsYou={false} />
          ))}
        </View>
      ) : null}

      {doneItems.length > 0 ? (
        <View>
          <Text style={styles.section}>DONE</Text>
          {doneItems.map((item) => (
            <Card key={item.key} item={item} inNeedsYou={false} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 7 },
  heading: { ...typography.display, color: colors.text, fontSize: 31 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  section: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 10, letterSpacing: 1.2, marginTop: 24, marginBottom: 10 },
  sectionNeedsYou: { color: colors.accent },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 10 },
  cardNeedsYou: { borderColor: 'rgba(184,157,96,0.5)', backgroundColor: 'rgba(184,157,96,0.08)' },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 58, height: 58, borderRadius: 9, backgroundColor: colors.surfaceRaised },
  cardTitle: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  cardLine: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  action: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionFull: { marginTop: 12, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionGold: { backgroundColor: colors.accent },
  actionGoldText: { ...typography.bodyBold, color: colors.black, fontSize: 12 },
  actionQuiet: { borderWidth: 1, borderColor: colors.border },
  actionQuietText: { ...typography.bodyBold, color: colors.textMuted, fontSize: 12 },
  actionOutline: { borderWidth: 1, borderColor: colors.accent },
  actionOutlineText: { ...typography.bodyBold, color: colors.accent, fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 58, paddingHorizontal: 28 },
  emptyTitle: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  emptyText: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginTop: 12 },
});
