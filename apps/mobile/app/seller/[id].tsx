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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { promptSignIn } from '@/lib/guest';
import { marketColors as colors, typography } from '@/lib/theme';

type InventoryItem = {
  id: string;
  title: string | null;
  brand: string | null;
  model: string | null;
  size: number;
  listing_type: string;
  primary_image_url: string | null;
};

type SellerResponse = {
  seller: { id: string; displayName: string; school?: string | null; photoUrl?: string | null };
  stats: { reviewCount: number; averageRating: number | null; soldCount?: number };
  inventory: { forSale: InventoryItem[]; trading: InventoryItem[]; collection: InventoryItem[] };
  followerCount: number;
  following: boolean;
  viewer: { isOwnProfile: boolean };
};

function sectionOf(item: InventoryItem): string {
  if (item.listing_type === 'sell') return 'For sale';
  if (item.listing_type === 'trade') return 'For trade';
  return 'Collection';
}

export default function SellerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [data, setData] = useState<SellerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingFollow, setSavingFollow] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setData(await apiFetch<SellerResponse>(`/api/market/sellers/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load seller');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggleFollow = async () => {
    if (!session) return promptSignIn(router, 'follow a seller');
    if (!data || savingFollow || data.viewer.isOwnProfile) return;
    setSavingFollow(true);
    try {
      await apiFetch(`/api/market/sellers/${id}/follow`, {
        method: data.following ? 'DELETE' : 'POST',
      });
      setData({
        ...data,
        following: !data.following,
        followerCount: data.followerCount + (data.following ? -1 : 1),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update follow');
    } finally {
      setSavingFollow(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Seller not found</Text>
        {error ? <Text style={styles.emptyText}>{error}</Text> : null}
      </View>
    );
  }

  const items = [
    ...data.inventory.forSale,
    ...data.inventory.trading,
    ...data.inventory.collection,
  ];
  const { seller, stats } = data;

  return (
    <FlatList
      style={styles.screen}
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.columns}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.identityRow}>
            {seller.photoUrl ? (
              <Image source={{ uri: seller.photoUrl }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoInitial}>{seller.displayName?.charAt(0) ?? 'G'}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{seller.displayName || 'Guild member'}</Text>
              {seller.school ? <Text style={styles.school}>{seller.school}</Text> : null}
              <Text style={styles.metaLine}>
                {stats.averageRating != null ? `★ ${stats.averageRating.toFixed(1)} · ` : ''}
                {stats.reviewCount} review{stats.reviewCount === 1 ? '' : 's'} · {data.followerCount}{' '}
                follower{data.followerCount === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          {!data.viewer.isOwnProfile ? (
            <Pressable
              style={[styles.followButton, data.following && styles.followButtonActive]}
              onPress={() => void toggleFollow()}
              disabled={savingFollow}
            >
              <Text style={[styles.followText, data.following && styles.followTextActive]}>
                {savingFollow ? '…' : data.following ? 'Following' : 'Follow seller'}
              </Text>
            </Pressable>
          ) : null}
          <Text style={styles.followHint}>
            Followers get notified whenever this seller lists a new pair.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionTitle}>
            {items.length} PAIR{items.length === 1 ? '' : 'S'} IN THEIR MARKET
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/listing/${item.id}`)}>
          <View style={styles.imageWrap}>
            {item.primary_image_url ? (
              <Image source={{ uri: item.primary_image_url }} style={styles.image} resizeMode="contain" />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]} />
            )}
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{sectionOf(item).toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title || [item.brand, item.model].filter(Boolean).join(' ') || 'Listing'}
          </Text>
          <Text style={styles.cardMeta}>Size {item.size}</Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No active pairs right now.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 48 },
  columns: { gap: 12 },
  header: { marginBottom: 8 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.accent },
  photoPlaceholder: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.accent,
  },
  photoInitial: { ...typography.display, color: colors.accent, fontSize: 26 },
  name: { ...typography.display, color: colors.text, fontSize: 24 },
  school: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 1 },
  metaLine: { ...typography.bodyMedium, color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  followButton: {
    marginTop: 14, backgroundColor: colors.accent, borderRadius: 999,
    paddingVertical: 12, alignItems: 'center',
  },
  followButtonActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
  followText: { ...typography.bodyBold, color: colors.white, fontSize: 15 },
  followTextActive: { color: colors.accent },
  followHint: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 8, textAlign: 'center' },
  error: { ...typography.body, color: colors.danger, marginTop: 8 },
  sectionTitle: { ...typography.brand, color: colors.accent, fontSize: 11, marginTop: 20, marginBottom: 10 },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 12 },
  imageWrap: { position: 'relative' },
  image: { width: '100%', height: 120, borderRadius: 6, backgroundColor: colors.surfaceRaised },
  imagePlaceholder: {},
  typeBadge: {
    position: 'absolute', top: 6, left: 6, backgroundColor: colors.accent,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  typeBadgeText: { ...typography.bodyBold, color: colors.white, fontSize: 8, letterSpacing: 0.5 },
  cardTitle: { ...typography.bodySemi, color: colors.text, fontSize: 13, marginTop: 8 },
  cardMeta: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 2 },
  emptyTitle: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  emptyText: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 6 },
});
