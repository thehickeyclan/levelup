import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type OfferMode = 'incoming' | 'sent';

type Offer = {
  id: string;
  listing_id?: string | null;
  offer_type: 'cash' | 'trade' | 'cash_and_trade';
  amount_cents?: number | null;
  message?: string | null;
  status: string;
  created_at?: string | null;
  buyer_label?: string | null;
  accepted_order_id?: string | null;
  accepted_trade_id?: string | null;
  market_listings?: ListingEmbed | ListingEmbed[] | null;
};

type ListingEmbed = {
  id: string;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  market_listing_images?: {
    public_url: string;
    clean_public_url?: string | null;
    use_clean?: boolean | null;
    display_order?: number | null;
  }[] | null;
};

function listingFromOffer(offer: Offer): ListingEmbed | null {
  const row = offer.market_listings;
  return Array.isArray(row) ? row[0] ?? null : row ?? null;
}

function imageFor(listing: ListingEmbed | null) {
  const images = [...(listing?.market_listing_images ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );
  const primary = images[0];
  if (!primary) return null;
  return primary.use_clean && primary.clean_public_url ? primary.clean_public_url : primary.public_url;
}

function titleFor(listing: ListingEmbed | null) {
  if (!listing) return 'Marketplace offer';
  return listing.title || [listing.brand, listing.model].filter(Boolean).join(' ') || 'Wrestling shoes';
}

function offerLabel(offer: Offer) {
  const cash = offer.amount_cents ? `$${Math.round(offer.amount_cents / 100)}` : null;
  if (offer.offer_type === 'cash') return cash || 'Cash offer';
  if (offer.offer_type === 'trade') return 'Trade offer';
  return `${cash || 'Cash'} + trade`;
}

export default function MarketOffersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [mode, setMode] = useState<OfferMode>(params.tab === 'sent' ? 'sent' : 'incoming');
  const [incoming, setIncoming] = useState<Offer[]>([]);
  const [sent, setSent] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [incomingRes, sentRes] = await Promise.all([
        apiFetch<{ offers: Offer[] }>('/api/market/offers'),
        apiFetch<{ offers: Offer[] }>('/api/market/offers?mode=sent'),
      ]);
      setIncoming(incomingRes.offers ?? []);
      setSent(sentRes.offers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load offers');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const offers = mode === 'incoming' ? incoming : sent;

  async function respond(offer: Offer, action: 'accept' | 'decline') {
    if (busyId) return;
    setBusyId(offer.id);
    setError(null);
    try {
      await apiFetch(`/api/market/offers/${offer.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      Alert.alert(action === 'accept' ? 'Offer accepted' : 'Offer declined', 'The buyer has been notified.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${action} offer`);
    } finally {
      setBusyId(null);
    }
  }

  async function payAcceptedOffer(offer: Offer) {
    const listing = listingFromOffer(offer);
    if (!listing?.id || !offer.accepted_order_id || busyId) return;
    setBusyId(offer.id);
    setError(null);
    try {
      const result = await apiFetch<{ checkoutUrl?: string }>('/api/market/checkout', {
        method: 'POST',
        body: JSON.stringify({ listingId: listing.id, orderId: offer.accepted_order_id }),
      });
      if (!result.checkoutUrl) throw new Error('Could not start secure checkout');
      await WebBrowser.openBrowserAsync(result.checkoutUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout');
    } finally {
      setBusyId(null);
    }
  }

  if (loading && incoming.length === 0 && sent.length === 0) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={offers}
      keyExtractor={(offer) => offer.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.kicker}>MARKET OFFERS</Text>
          <Text style={styles.heading}>Offers</Text>
          <Text style={styles.sub}>Review incoming bids and track offers you sent.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            <TabButton label={`Incoming ${incoming.filter((o) => o.status === 'pending').length || ''}`} selected={mode === 'incoming'} onPress={() => setMode('incoming')} />
            <TabButton label="Sent" selected={mode === 'sent'} onPress={() => setMode('sent')} />
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      renderItem={({ item }) => {
        const listing = listingFromOffer(item);
        const image = imageFor(listing);
        const pending = item.status === 'pending';
        return (
          <View style={styles.offerCard}>
            <Pressable style={styles.offerMain} onPress={() => listing?.id && router.push(`/listing/${listing.id}`)}>
              {image ? <Image source={{ uri: image }} style={styles.thumb} resizeMode="contain" /> : <View style={styles.thumb} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.offerTitle}>{titleFor(listing)}</Text>
                <Text style={styles.offerMeta}>
                  {mode === 'incoming' ? `${item.buyer_label || 'Buyer'} · ` : ''}
                  {offerLabel(item)}
                </Text>
                {item.message ? <Text style={styles.message} numberOfLines={2}>{item.message}</Text> : null}
              </View>
              <StatusPill status={item.status} />
            </Pressable>
            {mode === 'incoming' && pending ? (
              <View style={styles.responseRow}>
                <Pressable
                  style={[styles.responseButton, styles.declineButton]}
                  onPress={() => void respond(item, 'decline')}
                  disabled={busyId === item.id}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </Pressable>
                <Pressable
                  style={[styles.responseButton, styles.acceptButton]}
                  onPress={() => void respond(item, 'accept')}
                  disabled={busyId === item.id}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator color={colors.black} />
                  ) : (
                    <Text style={styles.acceptText}>Accept</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
            {mode === 'sent' && item.status === 'accepted' && item.accepted_order_id ? (
              <Pressable
                style={styles.fullWidthAction}
                onPress={() => void payAcceptedOffer(item)}
                disabled={busyId === item.id}
              >
                {busyId === item.id ? (
                  <ActivityIndicator color={colors.black} />
                ) : (
                  <Text style={styles.acceptText}>Pay accepted offer</Text>
                )}
              </Pressable>
            ) : null}
            {item.status === 'accepted' && item.accepted_trade_id ? (
              <Pressable
                style={styles.fullWidthSecondaryAction}
                onPress={() => router.push(`/market-trade/${item.accepted_trade_id}`)}
              >
                <Text style={styles.secondaryActionText}>View trade status</Text>
              </Pressable>
            ) : null}
          </View>
        );
      }}
      ListEmptyComponent={<Empty mode={mode} />}
    />
  );
}

function TabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, selected && styles.tabSelected]} onPress={onPress}>
      <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label.trim()}</Text>
    </Pressable>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'accepted' ? colors.success : status === 'declined' ? colors.danger : colors.accent;
  return (
    <View style={[styles.statusPill, { borderColor: color }]}>
      <Text style={[styles.statusText, { color }]}>{status.replaceAll('_', ' ')}</Text>
    </View>
  );
}

function Empty({ mode }: { mode: OfferMode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No offers yet</Text>
      <Text style={styles.emptyText}>
        {mode === 'incoming'
          ? 'When someone bids on one of your shoes, it will show up here.'
          : 'Offers you send to other Guild members will show up here.'}
      </Text>
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
  tabs: { gap: 8, paddingVertical: 18 },
  tab: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.surface },
  tabSelected: { borderColor: colors.accent, backgroundColor: 'rgba(184,157,96,0.14)' },
  tabText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 11 },
  tabTextSelected: { color: colors.accent },
  offerCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 12 },
  offerMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 62, height: 62, borderRadius: 9, backgroundColor: colors.surfaceRaised },
  offerTitle: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  offerMeta: { ...typography.bodySemi, color: colors.accent, fontSize: 11, marginTop: 4 },
  message: { ...typography.body, color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { ...typography.bodyBold, fontSize: 9, textTransform: 'capitalize' },
  responseRow: { flexDirection: 'row', gap: 9, marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  responseButton: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fullWidthAction: { marginTop: 12, minHeight: 42, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  fullWidthSecondaryAction: { marginTop: 10, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  declineButton: { borderWidth: 1, borderColor: colors.border },
  acceptButton: { backgroundColor: colors.accent },
  declineText: { ...typography.bodyBold, color: colors.textMuted, fontSize: 12 },
  acceptText: { ...typography.bodyBold, color: colors.black, fontSize: 12 },
  secondaryActionText: { ...typography.bodyBold, color: colors.accent, fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 58, paddingHorizontal: 28 },
  emptyTitle: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  emptyText: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginBottom: 10 },
});
