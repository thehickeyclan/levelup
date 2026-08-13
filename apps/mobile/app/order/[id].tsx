import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type OrderDetail = {
  id: string;
  order_ref?: string | null;
  status: string;
  status_label: string;
  amount_cents: number;
  shipping_cents?: number | null;
  created_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  listing_id: string;
  listing_title: string;
  listing_image?: string | null;
  role: 'buyer' | 'seller';
  shipping_carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  shipping_address_formatted?: string | null;
  can_add_tracking?: boolean;
  can_mark_received?: boolean;
  can_review_counterparty?: boolean;
  thread_id?: string | null;
  payout_cents?: number | null;
  payout_paid_at?: string | null;
  payout_method?: string | null;
  payout_status?: 'paid' | 'ready' | 'pending' | 'na' | null;
};

function payoutStatusLine(order: OrderDetail): string {
  if (order.payout_status === 'paid') {
    const when = order.payout_paid_at
      ? new Date(order.payout_paid_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    const method =
      order.payout_method && order.payout_method !== 'other' ? ` via ${order.payout_method}` : '';
    return `Sent${method}${when ? ` · ${when}` : ''}`;
  }
  if (order.payout_status === 'ready')
    return 'Processing — the Guild sends payouts within a few days of completion.';
  return 'Held until the buyer confirms delivery, then sent within a few days.';
}

type ReviewState = {
  canReviewCounterparty: boolean;
  direction: 'buyer' | 'seller';
  review: {
    id: string;
    rating: number;
    comment?: string | null;
    tags?: string[] | null;
    created_at: string;
  } | null;
  tagOptions: string[];
};

function formatMoney(cents: number | null | undefined) {
  if (cents == null) return '$0';
  return `$${(cents / 100).toFixed(0)}`;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [tracking, setTracking] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [orderRes, reviewRes] = await Promise.all([
        apiFetch<{ order: OrderDetail }>(`/api/market/orders/${id}`),
        apiFetch<ReviewState>(`/api/market/orders/${id}/review`).catch(() => null),
      ]);
      setOrder(orderRes.order);
      setTracking(orderRes.order.tracking_number ?? '');
      setReview(reviewRes);
      setComment(reviewRes?.review?.comment ?? '');
      setSelectedTags(reviewRes?.review?.tags ?? []);
      if (reviewRes?.review?.rating) setRating(reviewRes.review.rating);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load order');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  async function saveTracking() {
    if (!id || !tracking.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ order: OrderDetail }>(`/api/market/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tracking_number: tracking.trim() }),
      });
      setOrder(res.order);
      Alert.alert('Order updated', 'Tracking was saved and the buyer was notified.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save tracking');
    } finally {
      setSaving(false);
    }
  }

  async function markReceived() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ order: OrderDetail }>(`/api/market/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'received' }),
      });
      setOrder(res.order);
      await load();
      Alert.alert('Order complete', 'Thanks — the seller can now be paid per Guild Market policy.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete order');
    } finally {
      setSaving(false);
    }
  }

  async function submitReview() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ review: ReviewState['review'] }>(`/api/market/orders/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment, tags: selectedTags }),
      });
      setReview((current) =>
        current
          ? { ...current, review: res.review, canReviewCounterparty: false }
          : current
      );
      Alert.alert('Feedback saved', 'Your review was added to the marketplace history.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save review');
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 4)
    );
  }

  if (loading && !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Order not found'}</Text>
      </View>
    );
  }

  const reviewTarget = review?.direction === 'buyer' ? 'buyer' : 'seller';
  const total = order.amount_cents + (order.shipping_cents ?? 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <Text style={styles.kicker}>MARKET ORDER</Text>
      <Text style={styles.heading}>{order.role === 'seller' ? 'Sale details' : 'Order details'}</Text>
      <Text style={styles.sub}>
        {order.order_ref ? `Order ${order.order_ref} · ` : ''}
        {order.status_label}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.listingCard} onPress={() => router.push(`/listing/${order.listing_id}`)}>
        {order.listing_image ? (
          <Image source={{ uri: order.listing_image }} style={styles.image} resizeMode="contain" />
        ) : (
          <View style={styles.image} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>{order.listing_title}</Text>
          <Text style={styles.meta}>{order.role === 'seller' ? 'You sold this pair' : 'You bought this pair'}</Text>
        </View>
        <Text style={styles.amount}>{formatMoney(total)}</Text>
      </Pressable>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Status</Text>
        <View style={styles.statusPill}><Text style={styles.statusText}>{order.status_label}</Text></View>
        {order.created_at ? <Text style={styles.line}>Created {formatDate(order.created_at)}</Text> : null}
        {order.shipped_at ? <Text style={styles.line}>Shipped {formatDate(order.shipped_at)}</Text> : null}
        {order.delivered_at ? <Text style={styles.line}>Completed {formatDate(order.delivered_at)}</Text> : null}
        {order.thread_id ? (
          <Pressable style={styles.secondaryButton} onPress={() => router.push(`/thread/${order.thread_id}`)}>
            <Text style={styles.secondaryButtonText}>Message about this order</Text>
          </Pressable>
        ) : null}
      </View>

      {order.role === 'seller' ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Seller checklist</Text>
          {order.payout_cents != null && order.payout_status !== 'na' ? (
            <>
              <Text style={styles.label}>Your payout</Text>
              <Text style={styles.payoutAmount}>${(order.payout_cents / 100).toFixed(2)}</Text>
              <Text style={styles.payoutNote}>{payoutStatusLine(order)}</Text>
            </>
          ) : null}
          {order.shipping_address_formatted ? (
            <>
              <Text style={styles.label}>Ship to</Text>
              <Text style={styles.address}>{order.shipping_address_formatted}</Text>
            </>
          ) : (
            <Text style={styles.line}>Buyer shipping address will appear after payment.</Text>
          )}
          {order.can_add_tracking ? (
            <>
              <Text style={styles.label}>Tracking number</Text>
              <TextInput
                value={tracking}
                onChangeText={setTracking}
                placeholder="USPS / UPS / FedEx tracking"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                autoCapitalize="characters"
              />
              <Pressable style={styles.primaryButton} onPress={() => void saveTracking()} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save tracking'}</Text>
              </Pressable>
            </>
          ) : order.tracking_number ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => order.tracking_url && Linking.openURL(order.tracking_url)}
            >
              <Text style={styles.secondaryButtonText}>Track shipment · {order.tracking_number}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Buyer checklist</Text>
          {order.tracking_number ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => order.tracking_url && Linking.openURL(order.tracking_url)}
            >
              <Text style={styles.secondaryButtonText}>Track shipment · {order.tracking_number}</Text>
            </Pressable>
          ) : (
            <Text style={styles.line}>Tracking will appear here when the seller ships.</Text>
          )}
          {order.can_mark_received ? (
            <Pressable style={styles.primaryButton} onPress={() => void markReceived()} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Mark received'}</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {order.status === 'completed' ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Feedback</Text>
          {review?.review ? (
            <>
              <Text style={styles.stars}>{'★'.repeat(review.review.rating)}{'☆'.repeat(5 - review.review.rating)}</Text>
              {review.review.comment ? <Text style={styles.line}>{review.review.comment}</Text> : null}
              {(review.review.tags ?? []).length > 0 ? (
                <Text style={styles.line}>{(review.review.tags ?? []).join(' · ')}</Text>
              ) : null}
            </>
          ) : review?.canReviewCounterparty ? (
            <>
              <Text style={styles.line}>Leave a quick review for the {reviewTarget} so marketplace history stays trustworthy.</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable key={value} onPress={() => setRating(value)}>
                    <Text style={[styles.starButton, value <= rating && styles.starButtonSelected]}>★</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.tags}>
                {(review.tagOptions ?? []).map((tag) => {
                  const selected = selectedTags.includes(tag);
                  return (
                    <Pressable key={tag} style={[styles.tag, selected && styles.tagSelected]} onPress={() => toggleTag(tag)}>
                      <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder={`Anything other Guild members should know about this ${reviewTarget}?`}
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, styles.commentInput]}
                multiline
                maxLength={500}
              />
              <Pressable style={styles.primaryButton} onPress={() => void submitReview()} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Leave review'}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.line}>Feedback is complete for now.</Text>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 46 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 20 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 31 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 16 },
  error: { ...typography.body, color: colors.danger, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  listingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12 },
  image: { width: 78, height: 78, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  title: { ...typography.bodyBold, color: colors.text, fontSize: 15, lineHeight: 19 },
  meta: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 5 },
  amount: { ...typography.display, color: colors.accent, fontSize: 24 },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginTop: 14 },
  panelTitle: { ...typography.bodyBold, color: colors.text, fontSize: 16, marginBottom: 10 },
  statusPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(184,157,96,0.14)', borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  statusText: { ...typography.bodyBold, color: colors.accent, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  line: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  label: { ...typography.bodyBold, color: colors.text, fontSize: 12, marginTop: 8, marginBottom: 5 },
  payoutAmount: { ...typography.bodyBold, color: colors.accent, fontSize: 20 },
  payoutNote: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 3, marginBottom: 4 },
  address: { ...typography.body, color: colors.text, fontSize: 12, lineHeight: 18, backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 10 },
  input: { ...typography.body, minHeight: 46, color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 13 },
  commentInput: { minHeight: 94, paddingTop: 12, textAlignVertical: 'top', marginTop: 10 },
  primaryButton: { minHeight: 48, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  secondaryButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 12 },
  secondaryButtonText: { ...typography.bodyBold, color: colors.accent, fontSize: 13 },
  stars: { color: colors.accent, fontSize: 20, letterSpacing: 1.5 },
  ratingRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  starButton: { color: colors.textSecondary, fontSize: 30 },
  starButtonSelected: { color: colors.accent },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tag: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  tagSelected: { borderColor: colors.accent, backgroundColor: 'rgba(184,157,96,0.14)' },
  tagText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 11 },
  tagTextSelected: { color: colors.accent },
});
