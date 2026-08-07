import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type Listing = {
  id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  price_cents?: number | null;
  description?: string | null;
  primary_image_url?: string | null;
  market_listing_images?: {
    id: string;
    public_url: string;
    clean_public_url?: string | null;
    use_clean?: boolean;
    display_order: number;
  }[];
  size?: number | null;
  condition?: string | null;
  wear_state?: string | null;
  listing_type?: string | null;
  shipping_cents?: number | null;
  open_to_trade?: boolean;
  accepts_offers?: boolean;
  colorway?: string | null;
  rarity?: string | null;
};

type Seller = {
  displayName?: string | null;
  school?: string | null;
  photoUrl?: string | null;
};

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [listing, setListing] = useState<Listing | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [savingFollow, setSavingFollow] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [question, setQuestion] = useState('');
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<{
          listing: Listing;
          seller?: Seller;
          following?: boolean;
          viewer?: { isSeller?: boolean };
        }>(`/api/market/listings/${id}`);
        if (!cancelled) {
          setListing(res.listing);
          setSeller(res.seller ?? null);
          setFollowing(res.following === true);
          setIsOwner(res.viewer?.isSeller === true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load listing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const images = useMemo(() => {
    const rows = [...(listing?.market_listing_images ?? [])].sort(
      (a, b) => a.display_order - b.display_order
    );
    if (rows.length > 0) {
      return rows.map((image) => ({
        id: image.id,
        url:
          image.use_clean && image.clean_public_url
            ? image.clean_public_url
            : image.public_url,
      }));
    }
    return listing?.primary_image_url
      ? [{ id: 'primary', url: listing.primary_image_url }]
      : [];
  }, [listing]);
  const [activeImage, setActiveImage] = useState(0);
  const galleryWidth = Math.max(280, width - 40);

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

  async function askSeller() {
    const text = question.trim();
    if (!text || sendingQuestion) return;
    setSendingQuestion(true);
    setError(null);
    try {
      const result = await apiFetch<{ thread_id?: string }>(`/api/market/listings/${id}/qa`, {
        method: 'POST',
        body: JSON.stringify({ question: text }),
      });
      setQuestion('');
      if (result.thread_id) {
        router.push(`/thread/${result.thread_id}`);
      } else {
        Alert.alert('Message sent', 'Your question was sent to the seller.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not message seller');
    } finally {
      setSendingQuestion(false);
    }
  }

  async function buyNow() {
    if (checkingOut) return;
    setCheckingOut(true);
    setError(null);
    try {
      const result = await apiFetch<{ checkoutUrl?: string; orderRef?: string }>('/api/market/checkout', {
        method: 'POST',
        body: JSON.stringify({ listingId: id }),
      });
      if (!result.checkoutUrl) throw new Error('Could not start secure checkout');
      await WebBrowser.openBrowserAsync(result.checkoutUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout');
    } finally {
      setCheckingOut(false);
    }
  }

  async function shareListing() {
    const currentListing = listing;
    if (!currentListing) return;
    try {
      await Share.share({
        title: marketListingShareTitle(currentListing),
        message: marketListingShareMessage(currentListing),
        url: marketListingShareUrl(currentListing.id),
      });
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Try again in a moment.');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {images.length > 0 ? (
        <View>
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(image) => image.id}
            onMomentumScrollEnd={(event) => {
              setActiveImage(Math.round(event.nativeEvent.contentOffset.x / galleryWidth));
            }}
            renderItem={({ item }) => (
              <View style={[styles.imageFrame, { width: galleryWidth }]}>
                <Image source={{ uri: item.url }} style={styles.image} resizeMode="contain" />
              </View>
            )}
          />
          <View style={styles.galleryFooter}>
            <View style={styles.dots}>
              {images.map((image, index) => (
                <View
                  key={image.id}
                  style={[styles.dot, activeImage === index && styles.dotActive]}
                />
              ))}
            </View>
            <Text style={styles.imageCount}>{activeImage + 1} / {images.length}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.imageFrame, { width: galleryWidth }]}>
          <Text style={styles.emptyPhoto}>No photo</Text>
        </View>
      )}

      <Text style={styles.brand}>{listing.brand?.toUpperCase() || 'GUILD MARKET'}</Text>
      <Text style={styles.title}>{listing.model || listing.title}</Text>
      {listing.model && listing.title !== listing.model ? (
        <Text style={styles.subtitle}>{listing.title}</Text>
      ) : null}
      <View style={styles.priceRow}>
        <Text style={styles.price}>
          {listing.price_cents != null
            ? `$${(listing.price_cents / 100).toFixed(0)}`
            : listing.listing_type === 'trade'
              ? 'Trade only'
              : listing.listing_type === 'collection'
                ? 'Collection'
                : 'Make offer'}
        </Text>
        {listing.shipping_cents ? (
          <Text style={styles.shipping}>+ ${(listing.shipping_cents / 100).toFixed(0)} shipping</Text>
        ) : null}
      </View>

      <View style={styles.badges}>
        {listing.size ? <DetailBadge text={`Size ${listing.size}`} /> : null}
        {listing.wear_state ? (
          <DetailBadge
            text={
              listing.wear_state === 'bnib'
                ? 'New in box'
                : listing.wear_state === 'new_no_box'
                  ? 'New'
                  : listing.condition || 'Used'
            }
          />
        ) : listing.condition ? <DetailBadge text={listing.condition} /> : null}
        {listing.colorway ? <DetailBadge text={listing.colorway} /> : null}
        {listing.rarity ? <DetailBadge text={listing.rarity} accent /> : null}
        {listing.open_to_trade ? <DetailBadge text="Open to trade" accent /> : null}
      </View>

      <Pressable style={styles.shareButton} onPress={() => void shareListing()}>
        <Text style={styles.shareButtonText}>Share listing</Text>
      </Pressable>

      {seller ? (
        <View style={styles.sellerCard}>
          {seller.photoUrl ? (
            <Image source={{ uri: seller.photoUrl }} style={styles.sellerPhoto} />
          ) : (
            <View style={styles.sellerPhotoPlaceholder}>
              <Text style={styles.sellerInitial}>{seller.displayName?.charAt(0) ?? 'G'}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.sellerLabel}>SELLER</Text>
            <Text style={styles.sellerName}>{seller.displayName || 'Guild member'}</Text>
            {seller.school ? <Text style={styles.sellerSchool}>{seller.school}</Text> : null}
          </View>
        </View>
      ) : null}

      {listing.description ? (
        <View style={styles.descriptionCard}>
          <Text style={styles.sectionLabel}>ABOUT THIS PAIR</Text>
          <Text style={styles.body}>{listing.description}</Text>
        </View>
      ) : null}
      {isOwner ? (
        <Pressable style={styles.button} onPress={() => router.push(`/manage-listing/${id}`)}>
          <Text style={styles.buttonText}>Manage this listing</Text>
        </Pressable>
      ) : (
        <>
          <Pressable style={styles.watchButton} onPress={() => void toggleFollow()} disabled={savingFollow}>
            <Text style={styles.watchButtonText}>
              {savingFollow ? 'Saving…' : following ? 'Watching · Alerts on' : 'Watch this pair'}
            </Text>
          </Pressable>
          <View style={styles.askCard}>
            <Text style={styles.sectionLabel}>ASK THE SELLER</Text>
            <Text style={styles.askHelp}>
              Ask about fit, condition, trades, or whether they would take an offer.
            </Text>
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Example: Would you trade for size 9 Rulons?"
              placeholderTextColor={colors.textSecondary}
              multiline
              style={styles.askInput}
            />
            <Pressable
              style={[styles.askButton, (!question.trim() || sendingQuestion) && styles.disabled]}
              onPress={() => void askSeller()}
              disabled={!question.trim() || sendingQuestion}
            >
              {sendingQuestion ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={styles.buttonText}>Send message</Text>
              )}
            </Pressable>
          </View>
          <View style={styles.actionGrid}>
            {listing.price_cents != null ? (
              <Pressable
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={() => void buyNow()}
                disabled={checkingOut}
              >
                {checkingOut ? (
                  <ActivityIndicator color={colors.black} />
                ) : (
                  <Text style={styles.buttonText}>Buy now</Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              style={[
                styles.actionButton,
                listing.price_cents == null && styles.actionButtonPrimary,
                listing.price_cents != null && styles.actionButtonSecondary,
              ]}
              onPress={() => router.push(`/make-offer/${id}`)}
            >
              <Text
                style={[
                  styles.buttonText,
                  listing.price_cents != null && styles.actionButtonSecondaryText,
                ]}
              >
                Make offer / trade
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function DetailBadge({ text, accent = false }: { text: string; accent?: boolean }) {
  return (
    <View style={[styles.detailBadge, accent && styles.detailBadgeAccent]}>
      <Text style={[styles.detailBadgeText, accent && styles.detailBadgeTextAccent]}>{text}</Text>
    </View>
  );
}

function marketListingShareUrl(listingId: string) {
  return `https://www.wrestlingguild.com/market/listing/${listingId}`;
}

function marketListingShareTitle(listing: Listing) {
  const brand = listing.brand?.trim();
  const model = listing.model?.trim() || listing.title?.trim();
  return [brand, model].filter(Boolean).join(' ') || 'Guild Market listing';
}

function marketListingShareStatus(listing: Listing) {
  if (listing.price_cents != null) return `$${(listing.price_cents / 100).toFixed(0)}`;
  if (listing.listing_type === 'trade') return 'Open to trade';
  if (listing.listing_type === 'collection') {
    return listing.accepts_offers === false ? 'Guild Collection' : 'Guild Collection · offers welcome';
  }
  return 'Make an offer';
}

function marketListingShareMessage(listing: Listing) {
  const details = [listing.size ? `Size ${listing.size}` : null, marketListingShareStatus(listing)]
    .filter(Boolean)
    .join(' · ');
  return [
    marketListingShareTitle(listing),
    details,
    'See it on Guild Market:',
    marketListingShareUrl(listing.id),
  ]
    .filter(Boolean)
    .join('\n');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  imageFrame: { aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%', backgroundColor: colors.surfaceRaised },
  emptyPhoto: { ...typography.body, color: colors.textMuted, fontSize: 13 },
  galleryFooter: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 16, backgroundColor: colors.accent },
  imageCount: { ...typography.bodySemi, color: colors.textSecondary, fontSize: 10 },
  brand: { ...typography.bodyBold, color: colors.accent, fontSize: 10, letterSpacing: 1.3, marginTop: 10 },
  title: { ...typography.display, color: colors.text, fontSize: 27, marginTop: 7 },
  subtitle: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 5 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 13 },
  price: { ...typography.display, fontSize: 25, color: colors.accent },
  shipping: { ...typography.body, color: colors.textMuted, fontSize: 11 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  detailBadge: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  detailBadgeAccent: { borderColor: colors.accent, backgroundColor: 'rgba(184,157,96,0.12)' },
  detailBadgeText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 10, textTransform: 'capitalize' },
  detailBadgeTextAccent: { color: colors.accent },
  shareButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonText: { ...typography.bodyBold, color: colors.text, fontSize: 12 },
  sellerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, padding: 13, marginTop: 20 },
  sellerPhoto: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceRaised },
  sellerPhotoPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  sellerInitial: { ...typography.bodyBold, color: colors.accent, fontSize: 16 },
  sellerLabel: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 8, letterSpacing: 1 },
  sellerName: { ...typography.bodySemi, color: colors.text, fontSize: 14, marginTop: 3 },
  sellerSchool: { ...typography.body, color: colors.textMuted, fontSize: 10, marginTop: 2 },
  descriptionCard: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 22, paddingTop: 18 },
  sectionLabel: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 9, letterSpacing: 1.1 },
  body: { ...typography.body, marginTop: 9, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  askCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 13, padding: 14, marginTop: 18 },
  askHelp: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  askInput: {
    ...typography.body,
    minHeight: 86,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
  askButton: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGrid: { flexDirection: 'row', gap: 10, marginTop: 22 },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimary: { backgroundColor: colors.accent },
  actionButtonSecondary: { borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.background },
  actionButtonSecondaryText: { color: colors.accent },
  button: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 10,
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
  watchButtonText: { ...typography.bodyBold, color: colors.accent, fontSize: 13 },
  buttonText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  disabled: { opacity: 0.5 },
  error: { ...typography.body, color: colors.danger },
});
