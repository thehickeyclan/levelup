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
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type Listing = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  price_cents: number | null;
  primary_image_url?: string | null;
  primary_original_image_url?: string | null;
  size?: number | null;
  condition?: string | null;
  wear_state?: string | null;
  listing_type?: string | null;
  open_to_trade?: boolean;
};

function formatPrice(cents: number | null | undefined) {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(0)}`;
}

function listingPriceLabel(listing: Listing) {
  return (
    formatPrice(listing.price_cents) ??
    (listing.listing_type === 'trade'
      ? 'Trade'
      : listing.listing_type === 'collection'
        ? 'Collection'
        : 'Make offer')
  );
}

function listingName(listing: Listing) {
  return listing.title || [listing.brand, listing.model].filter(Boolean).join(' ') || 'Wrestling shoes';
}

function listingMeta(listing: Listing) {
  const pieces: string[] = [];
  if (listing.size) pieces.push(`Size ${listing.size}`);
  if (listing.wear_state === 'bnib') pieces.push('New in box');
  else if (listing.wear_state === 'new_no_box') pieces.push('New');
  else if (listing.condition) {
    pieces.push(listing.condition.charAt(0).toUpperCase() + listing.condition.slice(1));
  }
  return pieces.join(' · ');
}

type MarketFilter = 'all' | 'sell' | 'trade' | 'collection';

export default function MarketScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MarketFilter>('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<{ listings: Listing[] }>('/api/market/listings');
      setListings(res.listings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load market');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return listings.filter((listing) => {
      if (filter !== 'all' && listing.listing_type !== filter) return false;
      if (!normalizedQuery) return true;
      return [listing.title, listing.brand, listing.model, listing.condition, listing.size]
        .filter((value) => value != null)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [filter, listings, query]);
  const featured = filtered[0] ?? null;
  const gridListings = featured ? filtered.slice(1) : [];

  if (loading && listings.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      data={gridListings}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.columns}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load()}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.marketTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>MARKET</Text>
              <Text style={styles.heading}>Guild Market</Text>
            </View>
            <Pressable style={styles.myMarketButton} onPress={() => router.push('/my-market')}>
              <Text style={styles.myMarketButtonText}>♡ My Market</Text>
            </Pressable>
          </View>
          <Text style={styles.sub}>Find rare pairs, make offers, and trade with the Guild.</Text>
          <Pressable style={styles.addShoeButton} onPress={() => router.push('/add-shoe')}>
            <Text style={styles.addShoeButtonText}>+ Add a shoe</Text>
          </Pressable>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search shoes, brands, or sizes"
            placeholderTextColor={colors.textSecondary}
            style={styles.search}
            returnKeyType="search"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {([
              ['all', 'All'],
              ['sell', 'For sale'],
              ['trade', 'Trade'],
              ['collection', 'Collections'],
            ] as [MarketFilter, string][]).map(([value, label]) => {
              const selected = filter === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.filter, selected && styles.filterSelected]}
                  onPress={() => setFilter(value)}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {featured ? (
            <Pressable style={styles.featuredCard} onPress={() => router.push(`/listing/${featured.id}`)}>
              <View style={styles.featuredImageWrap}>
                {featured.primary_original_image_url || featured.primary_image_url ? (
                  <Image
                    source={{ uri: featured.primary_original_image_url ?? featured.primary_image_url! }}
                    style={styles.featuredImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.featuredImage, styles.imagePlaceholder]} />
                )}
                <View style={styles.featuredBadge}>
                  <Text style={styles.featuredBadgeText}>FEATURED</Text>
                </View>
              </View>
              <View style={styles.featuredInfo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featuredTitle}>{listingName(featured)}</Text>
                  <Text style={styles.featuredMeta}>{listingMeta(featured) || 'Guild listing'}</Text>
                </View>
                <Text style={styles.featuredPrice}>{listingPriceLabel(featured)}</Text>
              </View>
            </Pressable>
          ) : null}
          {gridListings.length > 0 ? <Text style={styles.sectionTitle}>MORE IN MARKET</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/listing/${item.id}`)}>
          <View style={styles.imageWrap}>
            {item.primary_original_image_url || item.primary_image_url ? (
              <Image
                source={{ uri: item.primary_original_image_url ?? item.primary_image_url! }}
                style={styles.image}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]} />
            )}
            {item.open_to_trade ? (
              <View style={styles.tradeBadge}><Text style={styles.tradeBadgeText}>TRADE</Text></View>
            ) : null}
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.title} numberOfLines={2}>{listingName(item)}</Text>
            <Text style={styles.meta} numberOfLines={1}>{listingMeta(item) || 'Guild listing'}</Text>
            <Text style={styles.price}>{listingPriceLabel(item)}</Text>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={
        !featured ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No matching listings</Text>
            <Text style={styles.emptyText}>Try another search or market filter.</Text>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  list: { padding: 20, paddingBottom: 40 },
  columns: { gap: 12 },
  header: { marginBottom: 14, width: '100%' },
  marketTopRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  kicker: { ...typography.brand, fontSize: 11, color: colors.accent, marginBottom: 8 },
  heading: { ...typography.display, fontSize: 28, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted, marginTop: 6, fontSize: 14 },
  myMarketButton: { minHeight: 44, borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  myMarketButtonText: { ...typography.bodySemi, color: colors.accent, fontSize: 10 },
  addShoeButton: { alignSelf: 'flex-start', minHeight: 44, backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  addShoeButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 11 },
  search: { ...typography.body, minHeight: 46, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, marginTop: 18, fontSize: 13 },
  filters: { gap: 8, paddingTop: 11, paddingBottom: 5 },
  filter: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  filterSelected: { borderColor: colors.accent, backgroundColor: 'rgba(184,157,96,0.16)' },
  filterText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 11 },
  filterTextSelected: { color: colors.accent },
  error: { color: colors.danger, marginTop: 8, fontFamily: 'Inter_400Regular' },
  featuredCard: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginTop: 15 },
  featuredImageWrap: { aspectRatio: 1.55, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  featuredImage: { width: '100%', height: '100%', backgroundColor: colors.surfaceRaised },
  featuredBadge: { position: 'absolute', left: 12, top: 12, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  featuredBadgeText: { ...typography.bodyBold, color: colors.black, fontSize: 8, letterSpacing: 0.9 },
  featuredInfo: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 },
  featuredTitle: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  featuredMeta: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 4 },
  featuredPrice: { ...typography.display, color: colors.accent, fontSize: 22 },
  sectionTitle: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 10, letterSpacing: 1.2, marginTop: 22, marginBottom: 10 },
  card: {
    width: '48.3%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  imageWrap: { width: '100%', aspectRatio: 0.92, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  image: { width: '100%', height: '100%', backgroundColor: colors.surfaceRaised },
  imagePlaceholder: { backgroundColor: colors.surfaceRaised },
  tradeBadge: { position: 'absolute', left: 8, top: 8, borderRadius: 999, backgroundColor: 'rgba(10,10,10,0.88)', borderWidth: 1, borderColor: colors.accent, paddingHorizontal: 7, paddingVertical: 4 },
  tradeBadgeText: { ...typography.bodyBold, color: colors.accent, fontSize: 7, letterSpacing: 0.8 },
  cardInfo: { padding: 11, minHeight: 105 },
  title: {
    ...typography.bodySemi,
    fontSize: 13,
    color: colors.text,
    lineHeight: 17,
  },
  meta: { ...typography.body, color: colors.textMuted, fontSize: 10, marginTop: 5 },
  price: {
    ...typography.bodyBold,
    fontSize: 14,
    color: colors.accent,
    marginTop: 9,
  },
  empty: { alignItems: 'center', paddingVertical: 58 },
  emptyTitle: { ...typography.bodySemi, color: colors.text, fontSize: 16 },
  emptyText: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 6 },
});
