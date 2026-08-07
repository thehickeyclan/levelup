import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type TradeListing = {
  id: string;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  size?: string | null;
  condition_label?: string | null;
  image_urls?: string[] | null;
};

type Trade = {
  id: string;
  status: string;
  boot_amount_cents?: number | null;
  initiator_fee_paid?: boolean | null;
  receiver_fee_paid?: boolean | null;
  viewer_fee_paid?: boolean | null;
  other_party_name?: string | null;
  initiator_name?: string | null;
  receiver_name?: string | null;
  expires_at?: string | null;
  thread_id?: string | null;
  initiator_listing?: TradeListing | null;
  receiver_listing?: TradeListing | null;
};

function money(cents?: number | null) {
  if (!cents) return '$0';
  return `$${Math.round(cents / 100)}`;
}

function titleFor(listing?: TradeListing | null) {
  if (!listing) return 'Wrestling shoes';
  return listing.title || [listing.brand, listing.model].filter(Boolean).join(' ') || 'Wrestling shoes';
}

function statusCopy(trade: Trade) {
  if (trade.status === 'completed') return 'Trade complete. Both sides are set.';
  if (trade.status === 'cancelled') return 'This trade was cancelled.';
  if (trade.status === 'expired') return 'This trade expired.';
  if (trade.viewer_fee_paid) return 'Your side is paid. Waiting on the other side.';
  return 'Trade accepted. Pay the small trade fee to keep it moving.';
}

export default function MarketTradeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      const res = await apiFetch<{ trade: Trade }>(`/api/market/trade/${id}`);
      setTrade(res.trade);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load trade');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function payFee() {
    if (!trade || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ checkoutUrl?: string }>(`/api/market/trade/${trade.id}/fee`, {
        method: 'POST',
      });
      if (!res.checkoutUrl) throw new Error('Could not start secure checkout');
      await WebBrowser.openBrowserAsync(res.checkoutUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start trade fee checkout');
    } finally {
      setBusy(false);
    }
  }

  async function cancelTrade() {
    if (!trade || busy) return;
    Alert.alert('Cancel trade?', 'This will stop the trade for both sides.', [
      { text: 'Keep trade', style: 'cancel' },
      {
        text: 'Cancel trade',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await apiFetch(`/api/market/trade/${trade.id}/cancel`, { method: 'POST' });
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not cancel trade');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  if (!trade) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || 'Trade not found'}</Text>
      </View>
    );
  }

  const canAct = ['accepted', 'pending_payment'].includes(trade.status);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>MARKET TRADE</Text>
      <Text style={styles.heading}>Trade status</Text>
      <Text style={styles.sub}>{statusCopy(trade)}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>{trade.initiator_name || 'First pair'}</Text>
        <TradeCard listing={trade.initiator_listing} />
        <Text style={styles.swap}>↔</Text>
        <Text style={styles.cardLabel}>{trade.receiver_name || trade.other_party_name || 'Second pair'}</Text>
        <TradeCard listing={trade.receiver_listing} />
        {trade.boot_amount_cents ? (
          <View style={styles.bootRow}>
            <Text style={styles.bootLabel}>Cash included</Text>
            <Text style={styles.bootValue}>{money(trade.boot_amount_cents)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.progressCard}>
        <ProgressRow label="Trade accepted" done />
        <ProgressRow label="Your trade fee" done={Boolean(trade.viewer_fee_paid)} />
        <ProgressRow label="Both sides paid" done={Boolean(trade.initiator_fee_paid && trade.receiver_fee_paid)} />
      </View>

      {canAct && !trade.viewer_fee_paid ? (
        <Pressable style={styles.primaryButton} onPress={() => void payFee()} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.primaryText}>Pay $4.99 trade fee</Text>}
        </Pressable>
      ) : null}

      {trade.thread_id ? (
        <Pressable style={styles.secondaryButton} onPress={() => router.push(`/thread/${trade.thread_id}`)}>
          <Text style={styles.secondaryText}>Message trade partner</Text>
        </Pressable>
      ) : null}

      {canAct ? (
        <Pressable style={styles.dangerButton} onPress={() => void cancelTrade()} disabled={busy}>
          <Text style={styles.dangerText}>Cancel this trade</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function TradeCard({ listing }: { listing?: TradeListing | null }) {
  const image = listing?.image_urls?.[0] ?? null;
  return (
    <View style={styles.tradeCard}>
      {image ? (
        <Image source={{ uri: image }} style={styles.tradeImage} resizeMode="contain" />
      ) : (
        <View style={styles.tradeImage} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.tradeTitle}>{titleFor(listing)}</Text>
        <Text style={styles.tradeMeta}>
          {[listing?.size ? `Size ${listing.size}` : null, listing?.condition_label].filter(Boolean).join(' · ') || 'Guild listing'}
        </Text>
      </View>
    </View>
  );
}

function ProgressRow({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.progressRow}>
      <View style={[styles.dot, done && styles.dotDone]} />
      <Text style={[styles.progressText, done && styles.progressTextDone]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 7 },
  heading: { ...typography.display, color: colors.text, fontSize: 31 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginTop: 12 },
  card: { marginTop: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 16, padding: 14 },
  cardLabel: { ...typography.bodyBold, color: colors.accent, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8 },
  tradeCard: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, backgroundColor: colors.background },
  tradeImage: { width: 78, height: 78, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  tradeTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  tradeMeta: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 4 },
  swap: { ...typography.display, color: colors.accent, fontSize: 26, textAlign: 'center', marginVertical: 10 },
  bootRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bootLabel: { ...typography.bodySemi, color: colors.textMuted, fontSize: 12 },
  bootValue: { ...typography.display, color: colors.accent, fontSize: 24 },
  progressCard: { marginTop: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  progressText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 12 },
  progressTextDone: { color: colors.text },
  primaryButton: { marginTop: 18, minHeight: 50, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  secondaryButton: { marginTop: 10, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
  dangerButton: { marginTop: 10, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  dangerText: { ...typography.bodyBold, color: colors.danger, fontSize: 14 },
});
