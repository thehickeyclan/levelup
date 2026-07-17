import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type Listing = {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  price_cents: number | null;
  primary_image_url?: string | null;
  size?: number | null;
};

function formatPrice(cents: number | null | undefined) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(0)}`;
}

export default function MarketScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      data={listings}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 10 }}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load()}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: 16, width: '100%' }}>
          <Text style={styles.kicker}>MARKET</Text>
          <Text style={styles.heading}>Guild Market</Text>
          <Text style={styles.sub}>Wrestling shoes — offers push to your phone.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/listing/${item.id}`)}>
          {item.primary_image_url ? (
            <Image source={{ uri: item.primary_image_url }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]} />
          )}
          <Text style={styles.title} numberOfLines={2}>
            {item.title || `${item.brand ?? ''} ${item.model ?? ''}`.trim()}
          </Text>
          <Text style={styles.price}>{formatPrice(item.price_cents)}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.sub}>No active listings.</Text>}
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
  list: { padding: 20, paddingBottom: 40, gap: 10 },
  kicker: { ...typography.brand, fontSize: 11, color: colors.accent, marginBottom: 8 },
  heading: { ...typography.display, fontSize: 28, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted, marginTop: 6, fontSize: 14 },
  error: { color: colors.danger, marginTop: 8, fontFamily: 'Inter_400Regular' },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceRaised },
  imagePlaceholder: { backgroundColor: colors.border },
  title: {
    ...typography.bodyMedium,
    fontSize: 13,
    color: colors.text,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  price: {
    ...typography.bodyBold,
    fontSize: 14,
    color: colors.accent,
    padding: 10,
    paddingTop: 4,
  },
});
