import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type ErrorBoundaryProps } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMobileCart } from '@/lib/mobile-cart';
import { colors, typography } from '@/lib/theme';
import { MIN_TOUCH_TARGET } from '@/lib/accessibility';

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
  // Mirror web checkout: show the wallet balance and let the family choose
  // whether credits apply (default on), instead of silently draining them.
  const [creditBalance, setCreditBalance] = useState(0);
  const [useCredits, setUseCredits] = useState(true);

  const loadCredits = useCallback(async () => {
    try {
      const data = await apiFetch<{ balance?: number }>('/api/credits');
      setCreditBalance(Number(data.balance ?? 0));
    } catch {
      setCreditBalance(0);
    }
  }, []);

  const loadWrestlers = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ wrestlers?: Wrestler[] }>('/api/wrestlers');
      const rows = (data.wrestlers ?? []).filter(
        (row) => row?.id && (row.first_name || row.last_name)
      );
      setWrestlers(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wrestlers');
    }
  }, []);

  useEffect(() => {
    if (!isCoachView) void loadWrestlers();
  }, [isCoachView, loadWrestlers]);

  // Refetch wrestlers on every focus: a newly linked wrestler (added on web or
  // by the other parent) must show up without force-quitting the app.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      if (!isCoachView) {
        void loadWrestlers();
        void loadCredits();
      }
    }, [refresh, isCoachView, loadWrestlers, loadCredits])
  );

  const creditsToApply = useCredits ? Math.min(creditBalance, total) : 0;
  const cardTotal = total - creditsToApply;

  const allAssigned = useMemo(
    () =>
      items.length > 0 &&
      items.every((item) => Boolean(item.athleteId || (wrestlers.length === 1 && wrestlers[0]?.id))),
    [items, wrestlers]
  );

  const athleteForItem = useCallback(
    (athleteId: string | null) =>
      athleteId || (wrestlers.length === 1 ? wrestlers[0]?.id ?? null : null),
    [wrestlers]
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
            wrestlerId: athleteForItem(item.athleteId),
          })),
          useCredits,
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
              .map((other) => athleteForItem(other.athleteId))
              .filter(Boolean);
            const selectedAthleteId = athleteForItem(item.athleteId);
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
                    const selected = selectedAthleteId === wrestler.id;
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
                {wrestlers.length === 0 ? (
                  <View style={styles.noWrestlers}>
                    <Text style={styles.selectionNeeded}>
                      We could not find a wrestler profile for this account.
                    </Text>
                    <Pressable onPress={() => router.push('/my-wrestlers')}>
                      <Text style={styles.manageWrestlers}>Manage wrestlers</Text>
                    </Pressable>
                  </View>
                ) : !selectedAthleteId ? (
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

            {creditBalance > 0 ? (
              <>
                <View style={[styles.summaryRow, styles.creditToggleRow]}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.creditToggleTitle}>Apply Guild credits</Text>
                    <Text style={styles.creditToggleMeta}>
                      You have ${creditBalance.toFixed(2)} in training credits
                    </Text>
                  </View>
                  <Switch
                    value={useCredits}
                    onValueChange={setUseCredits}
                    trackColor={{ true: colors.accent, false: colors.border }}
                    thumbColor={colors.surface}
                  />
                </View>
                {creditsToApply > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.creditLine}>Credits applied</Text>
                    <Text style={styles.creditLine}>-${creditsToApply.toFixed(2)}</Text>
                  </View>
                ) : null}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Card total</Text>
                  <Text style={styles.summaryTotal}>${cardTotal.toFixed(2)}</Text>
                </View>
                {useCredits && creditsToApply < creditBalance ? (
                  <Text style={styles.summaryNote}>
                    Remaining credit balance after purchase: $
                    {(creditBalance - creditsToApply).toFixed(2)}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.summaryNote}>Discounts are applied during checkout.</Text>
            )}

            <Pressable
              style={[styles.primaryButton, !allAssigned && styles.buttonDisabled]}
              onPress={() => void checkout()}
              disabled={!allAssigned || checkingOut}
            >
              {checkingOut ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {creditsToApply > 0 && cardTotal <= 0
                    ? 'Book with credits'
                    : 'Continue to secure checkout'}
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();

  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>Your cart is still saved</Text>
      <Text style={styles.emptyText}>
        We could not display it just now. No training spot or payment was lost.
      </Text>
      <Pressable style={styles.primaryButton} onPress={() => void retry()}>
        <Text style={styles.primaryButtonText}>Try cart again</Text>
      </Pressable>
      <Pressable
        style={styles.recoveryLink}
        onPress={() => router.replace({ pathname: '/(tabs)/find', params: { tab: 'available' } })}
      >
        <Text style={styles.manageWrestlers}>Back to training</Text>
      </Pressable>
      {__DEV__ ? <Text style={styles.debugError}>{error.message}</Text> : null}
    </View>
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
    minHeight: MIN_TOUCH_TARGET,
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
  noWrestlers: { gap: 8 },
  manageWrestlers: { ...typography.bodyBold, color: colors.accent, fontSize: 13 },
  recoveryLink: { marginTop: 16, padding: 8 },
  debugError: {
    ...typography.body,
    color: colors.danger,
    fontSize: 11,
    marginTop: 16,
    textAlign: 'center',
  },
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
  creditToggleRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  creditToggleTitle: { ...typography.bodySemi, color: colors.text, fontSize: 14 },
  creditToggleMeta: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  creditLine: { ...typography.bodySemi, color: colors.accent, fontSize: 14 },
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
