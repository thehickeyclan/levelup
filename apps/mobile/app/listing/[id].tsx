import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { apiFetch } from '@/lib/api';
import { WEB_ORIGIN } from '@/lib/config';
import { colors } from '@/lib/theme';

type Listing = {
  id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  price_cents?: number | null;
  description?: string | null;
  primary_image_url?: string | null;
};

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [savingFollow, setSavingFollow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{ listing: Listing; following?: boolean }>(`/api/market/listings/${id}`);
        if (!cancelled) {
          setListing(res.listing);
          setFollowing(res.following === true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load listing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!listing && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  async function toggleFollow() {
    if (savingFollow) return;
    setSavingFollow(true);
    setError(null);
    try {
      await apiFetch(`/api/market/listings/${id}/follow`, { method: following ? 'DELETE' : 'POST' });
      setFollowing(!following);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update watch list');
    } finally {
      setSavingFollow(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {listing.primary_image_url ? (
        <Image source={{ uri: listing.primary_image_url }} style={styles.image} />
      ) : null}
      <Text style={styles.title}>{listing.title}</Text>
      <Text style={styles.price}>
        {listing.price_cents != null ? `$${(listing.price_cents / 100).toFixed(0)}` : '—'}
      </Text>
      {listing.description ? <Text style={styles.body}>{listing.description}</Text> : null}
      <Pressable style={styles.watchButton} onPress={() => void toggleFollow()} disabled={savingFollow}>
        <Text style={styles.watchButtonText}>
          {savingFollow ? 'Saving…' : following ? 'Watching · Alerts on' : 'Watch this pair'}
        </Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/market/listing/${id}`)}
      >
        <Text style={styles.buttonText}>Buy / offer on web</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  container: { padding: 20, paddingBottom: 40 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.surface },
  title: { fontSize: 22, fontWeight: '800', marginTop: 16 },
  price: { fontSize: 18, fontWeight: '700', marginTop: 8, color: colors.accent },
  body: { marginTop: 12, fontSize: 15, lineHeight: 22, color: colors.text },
  button: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchButton: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchButtonText: { color: colors.accent, fontWeight: '700' },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: colors.danger },
});
