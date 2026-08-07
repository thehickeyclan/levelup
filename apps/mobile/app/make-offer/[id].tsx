import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type OfferType = 'cash' | 'trade' | 'cash_and_trade';

type Listing = {
  id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  size?: number | null;
  price_cents?: number | null;
  primary_image_url?: string | null;
  listing_type?: string | null;
  open_to_trade?: boolean | null;
  accepts_offers?: boolean | null;
};

type OwnListing = {
  id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  size?: number | null;
  listing_type?: string | null;
  primary_image_url?: string | null;
};

function titleFor(listing: Pick<Listing, 'title' | 'brand' | 'model'>) {
  return listing.title || [listing.brand, listing.model].filter(Boolean).join(' ') || 'Wrestling shoes';
}

function cashAllowed(listing: Listing) {
  const type = listing.listing_type || 'sell';
  if (type === 'collection' || type === 'vault') return listing.accepts_offers !== false;
  if (type === 'trade') return false;
  if (listing.price_cents == null) return true;
  return listing.accepts_offers !== false && listing.price_cents > 0;
}

function tradeAllowed(listing: Listing) {
  return listing.listing_type === 'trade' || (listing.listing_type === 'sell' && listing.open_to_trade === true);
}

export default function MakeOfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [ownListings, setOwnListings] = useState<OwnListing[]>([]);
  const [offerType, setOfferType] = useState<OfferType>('cash');
  const [amount, setAmount] = useState('');
  const [tradeListingId, setTradeListingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [listingRes, mineRes] = await Promise.all([
          apiFetch<{ listing: Listing }>(`/api/market/listings/${id}`),
          apiFetch<{ listings: OwnListing[] }>(`/api/market/listings?seller=me&status=active&exclude=${id}&limit=150`),
        ]);
        if (cancelled) return;
        const target = listingRes.listing;
        const mine = mineRes.listings ?? [];
        setListing(target);
        setOwnListings(mine);
        setTradeListingId(mine[0]?.id ?? null);
        if (!cashAllowed(target) && tradeAllowed(target)) setOfferType('trade');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load offer screen');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canCash = listing ? cashAllowed(listing) : false;
  const canTrade = listing ? tradeAllowed(listing) : false;
  const needsCash = offerType === 'cash' || offerType === 'cash_and_trade';
  const needsTrade = offerType === 'trade' || offerType === 'cash_and_trade';
  const amountCents = useMemo(() => {
    const dollars = Number(amount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(dollars) || dollars <= 0) return 0;
    return Math.round(dollars * 100);
  }, [amount]);
  const canSubmit =
    !submitting &&
    listing &&
    (!needsCash || amountCents >= 100) &&
    (!needsTrade || Boolean(tradeListingId));

  async function submitOffer() {
    if (!listing || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/market/offers', {
        method: 'POST',
        body: JSON.stringify({
          listingId: listing.id,
          offerType,
          amountCents: needsCash ? amountCents : undefined,
          tradeListingId: needsTrade ? tradeListingId : undefined,
          message: message.trim() || undefined,
        }),
      });
      Alert.alert('Offer sent', 'The seller can review it in Guild Market.', [
        {
          text: 'View sent offers',
          onPress: () => router.replace({ pathname: '/market-offers', params: { tab: 'sent' } }),
        },
        { text: 'Done', onPress: () => router.back(), style: 'cancel' },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send offer');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  if (!listing) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || 'Listing not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>MARKET OFFER</Text>
      <Text style={styles.heading}>Make an offer</Text>
      <Text style={styles.sub}>Send cash, a trade, or trade + cash. The seller gets an alert.</Text>

      <View style={styles.listingCard}>
        {listing.primary_image_url ? (
          <Image source={{ uri: listing.primary_image_url }} style={styles.listingImage} resizeMode="contain" />
        ) : (
          <View style={styles.listingImage} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.listingTitle}>{titleFor(listing)}</Text>
          <Text style={styles.listingMeta}>
            {[listing.size ? `Size ${listing.size}` : null, listing.price_cents ? `$${Math.round(listing.price_cents / 100)}` : null]
              .filter(Boolean)
              .join(' · ') || 'Collection'}
          </Text>
        </View>
      </View>

      <Text style={styles.section}>Offer type</Text>
      <View style={styles.typeGrid}>
        {canCash ? (
          <TypeButton label="Cash" selected={offerType === 'cash'} onPress={() => setOfferType('cash')} />
        ) : null}
        {canTrade ? (
          <TypeButton label="Trade" selected={offerType === 'trade'} onPress={() => setOfferType('trade')} />
        ) : null}
        {canCash && canTrade ? (
          <TypeButton label="Trade + cash" selected={offerType === 'cash_and_trade'} onPress={() => setOfferType('cash_and_trade')} />
        ) : null}
      </View>

      {needsCash ? (
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Cash amount</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="Example: 120"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>
      ) : null}

      {needsTrade ? (
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Your pair to trade</Text>
          {ownListings.length > 0 ? (
            <View style={styles.tradeList}>
              {ownListings.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.tradeRow, tradeListingId === item.id && styles.tradeRowSelected]}
                  onPress={() => setTradeListingId(item.id)}
                >
                  {item.primary_image_url ? (
                    <Image source={{ uri: item.primary_image_url }} style={styles.tradeImage} resizeMode="contain" />
                  ) : (
                    <View style={styles.tradeImage} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tradeTitle}>{titleFor(item)}</Text>
                    <Text style={styles.tradeMeta}>{item.size ? `Size ${item.size}` : 'Your listing'}</Text>
                  </View>
                  <View style={[styles.radio, tradeListingId === item.id && styles.radioSelected]} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyTrade}>
              <Text style={styles.emptyTradeTitle}>Add a pair first</Text>
              <Text style={styles.emptyTradeText}>You need one active shoe in My Market to include it in a trade offer.</Text>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push({ pathname: '/add-shoe', params: { mode: 'trade' } })}
              >
                <Text style={styles.secondaryButtonText}>Add trade pair</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Message</Text>
        <TextInput
          value={message}
          onChangeText={(value) => setMessage(value.slice(0, 200))}
          placeholder="Optional note to the seller"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.input, styles.messageInput]}
        />
        <Text style={styles.counter}>{message.length}/200</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.submitButton, !canSubmit && styles.disabled]}
        onPress={() => void submitOffer()}
        disabled={!canSubmit}
      >
        {submitting ? <ActivityIndicator color={colors.black} /> : <Text style={styles.submitText}>Send offer</Text>}
      </Pressable>
    </ScrollView>
  );
}

function TypeButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.typeButton, selected && styles.typeButtonSelected]} onPress={onPress}>
      <Text style={[styles.typeButtonText, selected && styles.typeButtonTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24 },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 7 },
  heading: { ...typography.display, color: colors.text, fontSize: 31 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  listingCard: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginTop: 20 },
  listingImage: { width: 76, height: 76, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  listingTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  listingMeta: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 5 },
  section: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 10, letterSpacing: 1, marginTop: 22, marginBottom: 10, textTransform: 'uppercase' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface },
  typeButtonSelected: { borderColor: colors.accent, backgroundColor: 'rgba(184,157,96,0.16)' },
  typeButtonText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 12 },
  typeButtonTextSelected: { color: colors.accent },
  fieldBlock: { marginTop: 18 },
  label: { ...typography.bodyBold, color: colors.text, fontSize: 13, marginBottom: 8 },
  input: { ...typography.body, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, fontSize: 15, padding: 13 },
  messageInput: { minHeight: 92, textAlignVertical: 'top', lineHeight: 20 },
  counter: { ...typography.body, color: colors.textMuted, fontSize: 10, textAlign: 'right', marginTop: 5 },
  tradeList: { gap: 9 },
  tradeRow: { flexDirection: 'row', gap: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, padding: 10 },
  tradeRowSelected: { borderColor: colors.accent, backgroundColor: 'rgba(184,157,96,0.12)' },
  tradeImage: { width: 52, height: 52, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  tradeTitle: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  tradeMeta: { ...typography.body, color: colors.textMuted, fontSize: 10, marginTop: 3 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  emptyTrade: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 13, padding: 14 },
  emptyTradeTitle: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  emptyTradeText: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  secondaryButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 10, minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  secondaryButtonText: { ...typography.bodyBold, color: colors.accent, fontSize: 12 },
  submitButton: { marginTop: 24, minHeight: 50, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  submitText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  disabled: { opacity: 0.48 },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginTop: 14 },
});
