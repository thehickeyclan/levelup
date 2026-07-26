import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMobileCart } from '@/lib/mobile-cart';
import { colors, typography } from '@/lib/theme';

type Wrestler = {
  id: string;
  first_name: string;
  last_name: string;
};

type CheckoutResponse = {
  checkoutUrl?: string;
  paidWithCredits?: boolean;
  redirectUrl?: string;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CartScreen() {
  const router = useRouter();
  const { isCoachView } = useAuth();
  const {
    items,
    count,
    total,
    loading,
    refresh,
    removeLine,
    setAthlete,
    clear,
  } = useMobileCart();
  const [wrestlers, setWrestlers] = useState<Wrestler[]>([]);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWrestlers = useCallback(async () => {
    try {
      const data = await apiFetch<{ wrestlers?: Wrestler[] }>('/api/wrestlers');
      const rows = data.wrestlers ?? [];
      setWrestlers(rows);
      if (rows.length === 1) {
        for (const item of items) {
          if (!item.athleteId) await setAthlete(item.lineId, rows[0].id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wrestlers');
    }
  }, [items, setAthlete]);

  useEffect(() => {
    if (!isCoachView) void loadWrestlers();
  }, [isCoachView, loadWrestlers]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const allAssigned = useMemo(
    () => items.length > 0 && items.every((item) => Boolean(item.athleteId)),
    [items]
  );

  async function selectWrestler(lineId: string, athleteId: string) {
    setBusyLine(lineId);
    setError(null);
    try {
      await setAthlete(lineId, athleteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not select wrestler');
    } finally {
      setBusyLine(null);
    }
  }

  async function remove(lineId: string) {
    setBusyLine(lineId);
    setError(null);
    try {
      await removeLine(lineId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove item');
    } finally {
      setBusyLine(null);
    }
  }

  async function checkout() {
    if (!allAssigned || checkingOut) return;
    setCheckingOut(true);
    setError(null);
    try {
      const data = await apiFetch<CheckoutResponse>('/api/cart/checkout', {
        method: 'POST',
        body: JSON.stringify({
          lines: items.map((item) => ({
            sessionId: item.sessionId,
            wrestlerId: item.athleteId,
          })),
          useCredits: true,
        }),
      });

      if (data.paidWithCredits) {
        await clear();
        router.replace({ pathname: '/(tabs)/find', params: { tab: 'mine' } });
        return;
      }
      if (!data.checkoutUrl) throw new Error('Could not start secure checkout');
      await WebBrowser.openBrowserAsync(data.checkoutUrl);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout');
    } finally {
      setCheckingOut(false);
    }
  }

  if (isCoachView) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Training Cart is for families</Text>
        <Text style={styles.emptyText}>Switch to parent view to register wrestlers for training.</Text>
      </View>
    );
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>TRAINING</Text>
      <Text style={styles.heading}>Cart</Text>
      <Text style={styles.sub}>
        {count} training {count === 1 ? 'spot' : 'spots'} · Marketplace purchases are separate.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your Training Cart is empty</Text>
          <Text style={styles.emptyText}>
            Browse open sessions and add a spot for each wrestler you want to register.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push({ pathname: '/(tabs)/find', params: { tab: 'available' } })}
          >
            <Text style={styles.primaryButtonText}>Find training</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {items.map((item) => {
            const takenForSession = items
              .filter((other) => other.lineId !== item.lineId && other.sessionId === item.sessionId)
              .map((other) => other.athleteId)
              .filter(Boolean);
            return (
              <View key={item.lineId} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardKicker}>
                    {(item.sessionType ?? 'Training').replaceAll('_', ' ').toUpperCase()}
                  </Text>
                  <Pressable
                    onPress={() => void remove(item.lineId)}
                    disabled={busyLine !== null}
                    accessibilityRole="button"
                    accessibilityLabel="Remove training from cart"
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
                <Text style={styles.cardTitle}>{formatWhen(item.scheduledDatetime)}</Text>
                <Text style={styles.cardMeta}>{item.coachName}</Text>
                <Text style={styles.cardMeta}>{item.facilityName}</Text>
                <Text style={styles.price}>${item.price.toFixed(0)}</Text>

                <Text style={styles.selectLabel}>Who is training?</Text>
                <View style={styles.wrestlerOptions}>
                  {wrestlers.map((wrestler) => {
                    const selected = item.athleteId === wrestler.id;
                    const unavailable = takenForSession.includes(wrestler.id);
                    return (
                      <Pressable
                        key={wrestler.id}
                        style={[
                          styles.wrestlerChip,
                          selected && styles.wrestlerChipSelected,
                          unavailable && styles.wrestlerChipDisabled,
                        ]}
                        onPress={() => void selectWrestler(item.lineId, wrestler.id)}
                        disabled={busyLine !== null || unavailable}
                      >
                        <Text
                          style={[
                            styles.wrestlerChipText,
                            selected && styles.wrestlerChipTextSelected,
                          ]}
                        >
                          {wrestler.first_name} {wrestler.last_name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!item.athleteId ? (
                  <Text style={styles.selectionNeeded}>Select a wrestler for this spot.</Text>
                ) : null}
              </View>
            );
          })}

          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Training total</Text>
              <Text style={styles.summaryTotal}>${total.toFixed(0)}</Text>
            </View>
            <Text style={styles.summaryNote}>
              Available Guild credits and discounts are applied during checkout.
            </Text>
            <Pressable
              style={[styles.primaryButton, !allAssigned && styles.buttonDisabled]}
              onPress={() => void checkout()}
              disabled={!allAssigned || checkingOut}
            >
              {checkingOut ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={styles.primaryButtonText}>Continue to secure checkout</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 28 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 6 },
  error: { ...typography.body, color: colors.danger, fontSize: 13, marginTop: 12 },
  empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 20 },
  emptyTitle: { ...typography.bodySemi, color: colors.text, fontSize: 17, textAlign: 'center' },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardKicker: { ...typography.brand, color: colors.accent, fontSize: 9 },
  removeText: { ...typography.bodySemi, color: colors.danger, fontSize: 12 },
  cardTitle: { ...typography.bodySemi, color: colors.text, fontSize: 16, marginTop: 12 },
  cardMeta: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 3 },
  price: { ...typography.bodyBold, color: colors.accent, fontSize: 16, marginTop: 10 },
  selectLabel: { ...typography.bodySemi, color: colors.text, fontSize: 12, marginTop: 16 },
  wrestlerOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  wrestlerChip: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrestlerChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  wrestlerChipDisabled: { opacity: 0.35 },
  wrestlerChipText: { ...typography.bodyMedium, color: colors.text, fontSize: 12 },
  wrestlerChipTextSelected: { color: colors.black },
  selectionNeeded: { ...typography.body, color: colors.danger, fontSize: 11, marginTop: 8 },
  summary: {
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { ...typography.bodySemi, color: colors.text, fontSize: 15 },
  summaryTotal: { ...typography.display, color: colors.accent, fontSize: 24 },
  summaryNote: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 6 },
  primaryButton: {
    minHeight: 50,
    marginTop: 18,
    paddingHorizontal: 20,
    borderRadius: 4,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  buttonDisabled: { opacity: 0.45 },
});
