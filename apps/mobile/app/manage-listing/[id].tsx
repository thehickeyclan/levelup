import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

type ListingType = 'collection' | 'sell' | 'trade';
type Listing = {
  id: string;
  title: string;
  listing_type: string;
  status: string;
  price_cents?: number | null;
  accepts_offers?: boolean | null;
  open_to_trade?: boolean | null;
};

function normalizedType(value: string): ListingType {
  if (value === 'sell') return 'sell';
  if (value === 'trade' || value === 'trade_only') return 'trade';
  return 'collection';
}

export default function ManageListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [listingType, setListingType] = useState<ListingType>('collection');
  const [price, setPrice] = useState('');
  const [acceptsOffers, setAcceptsOffers] = useState(true);
  const [openToTrade, setOpenToTrade] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<{ listing: Listing; viewer?: { isSeller?: boolean } }>(`/api/market/listings/${id}`)
      .then((result) => {
        if (!result.viewer?.isSeller) throw new Error('Only the seller can manage this listing.');
        setListing(result.listing);
        setListingType(normalizedType(result.listing.listing_type));
        setPrice(result.listing.price_cents != null ? String(result.listing.price_cents / 100) : '');
        setAcceptsOffers(result.listing.accepts_offers !== false);
        setOpenToTrade(result.listing.open_to_trade === true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load listing'));
  }, [id]);

  function confirmDelete() {
    if (saving) return;
    Alert.alert('Delete this pair?', 'This removes the listing and its photos from Guild Market. This cannot be undone.', [
      { text: 'Keep pair', style: 'cancel' },
      {
        text: 'Delete pair',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSaving(true);
            setError(null);
            try {
              await apiFetch(`/api/market/listings/${id}`, { method: 'DELETE' });
              Alert.alert('Pair deleted', 'The listing was removed from your Market.', [
                { text: 'Done', onPress: () => router.replace('/my-market') },
              ]);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete this listing');
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  }

  async function save(nextStatus?: 'active' | 'archived') {
    if (!listing || saving) return;
    const numericPrice = Number(price);
    if (listingType === 'sell' && (!Number.isFinite(numericPrice) || numericPrice <= 0)) {
      setError('Enter a valid sale price.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/market/listings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          listing_type: listingType,
          price_cents: listingType === 'sell' ? Math.round(numericPrice * 100) : null,
          open_to_trade: listingType === 'trade' || openToTrade,
          accepts_offers: listingType !== 'trade' ? acceptsOffers : true,
          ...(nextStatus ? { status: nextStatus } : {}),
        }),
      });
      Alert.alert('Listing updated', nextStatus === 'archived' ? 'The listing is archived.' : 'Your changes are live.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update listing');
    } finally {
      setSaving(false);
    }
  }

  if (!listing && !error) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>MY MARKET</Text>
      <Text style={styles.heading}>Manage listing</Text>
      <Text style={styles.title}>{listing?.title}</Text>

      <Text style={styles.label}>LISTING MODE</Text>
      <View style={styles.choices}>
        {([
          ['collection', 'Collection'],
          ['sell', 'For sale'],
          ['trade', 'Trade'],
        ] as [ListingType, string][]).map(([value, label]) => (
          <Pressable key={value} style={[styles.choice, listingType === value && styles.choiceSelected]} onPress={() => setListingType(value)}>
            <Text style={[styles.choiceText, listingType === value && styles.choiceTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {listingType === 'sell' ? (
        <>
          <Text style={styles.label}>PRICE</Text>
          <View style={styles.field}>
            <Text style={styles.prefix}>$</Text>
            <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={styles.input} placeholder="75" placeholderTextColor={colors.textSecondary} />
          </View>
          <Pressable style={styles.toggleRow} onPress={() => setAcceptsOffers((value) => !value)}>
            <View style={[styles.toggleDot, acceptsOffers && styles.toggleDotOn]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Accept offers</Text>
              <Text style={styles.toggleMeta}>Let members bid below ask and start a market conversation.</Text>
            </View>
          </Pressable>
          <Pressable style={styles.toggleRow} onPress={() => setOpenToTrade((value) => !value)}>
            <View style={[styles.toggleDot, openToTrade && styles.toggleDotOn]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Also open to trade</Text>
              <Text style={styles.toggleMeta}>Show this pair to members browsing trades.</Text>
            </View>
          </Pressable>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.save, saving && styles.disabled]} onPress={() => void save(listing?.status === 'draft' || listing?.status === 'archived' ? 'active' : undefined)} disabled={saving || !listing}>
        {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveText}>{listing?.status === 'draft' || listing?.status === 'archived' ? 'Publish listing' : 'Save changes'}</Text>}
      </Pressable>
      {listing?.status === 'active' ? (
        <Pressable style={styles.archive} onPress={() => void save('archived')} disabled={saving}>
          <Text style={styles.archiveText}>Archive listing</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.deleteRow} onPress={confirmDelete} disabled={saving || !listing}>
        <Text style={styles.deleteText}>Delete pair</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 28 },
  title: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 7 },
  label: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 9, letterSpacing: 1, marginTop: 22, marginBottom: 9 },
  choices: { flexDirection: 'row', gap: 7 },
  choice: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  choiceSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 11 },
  choiceTextSelected: { color: colors.black },
  field: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 12 },
  prefix: { ...typography.bodySemi, color: colors.accent, fontSize: 17 },
  input: { ...typography.bodySemi, flex: 1, color: colors.text, fontSize: 16, paddingHorizontal: 7 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginTop: 12 },
  toggleDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  toggleDotOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  toggleTitle: { ...typography.bodyBold, color: colors.text, fontSize: 13 },
  toggleMeta: { ...typography.body, color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginTop: 15 },
  save: { minHeight: 54, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  saveText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  archive: { minHeight: 50, borderRadius: 9, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  archiveText: { ...typography.bodySemi, color: colors.danger, fontSize: 13 },
  deleteRow: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  deleteText: { ...typography.bodySemi, color: colors.danger, fontSize: 13 },
  disabled: { opacity: 0.5 },
});
