import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type WalletData = {
  balance: number;
  credits: { id: string; amount: number; remaining: number; reason?: string; expiresAt?: string | null; createdAt: string }[];
  history: { id: string; amount: number; type: string; description?: string; createdAt: string }[];
  ledger: { id: string; kind: string; amount: number; description?: string; createdAt: string }[];
};

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export default function WalletScreen() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiFetch<WalletData>('/api/credits'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wallet');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const activity = data?.ledger?.length ? data.ledger : data?.history ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <Text style={styles.kicker}>WALLET</Text>
      <Text style={styles.heading}>Guild credits</Text>
      <View style={styles.balanceCard}>
        <Text style={styles.label}>AVAILABLE BALANCE</Text>
        <Text style={styles.balance}>{money(data?.balance ?? 0)}</Text>
        <Text style={styles.note}>Credits apply automatically during training checkout.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !data ? <ActivityIndicator color={colors.accent} /> : null}

      <Text style={styles.section}>Active credits</Text>
      {(data?.credits ?? []).map((credit) => (
        <View key={credit.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{credit.reason || 'Guild credit'}</Text>
            <Text style={styles.rowMeta}>Added {new Date(credit.createdAt).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.amount}>{money(credit.remaining)}</Text>
        </View>
      ))}
      {!loading && (data?.credits.length ?? 0) === 0 ? <Text style={styles.empty}>No active credits.</Text> : null}

      <Text style={styles.section}>Payment activity</Text>
      {activity.map((item) => (
        <View key={item.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.description || ('type' in item ? item.type : item.kind).replaceAll('_', ' ')}</Text>
            <Text style={styles.rowMeta}>{new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <Text style={[styles.amount, item.amount < 0 && styles.debit]}>
            {item.amount > 0 ? '+' : ''}{money(item.amount)}
          </Text>
        </View>
      ))}
      {!loading && activity.length === 0 ? <Text style={styles.empty}>No wallet activity yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 34, marginTop: 6 },
  balanceCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 20, marginTop: 18 },
  label: { ...typography.brand, color: colors.accent, fontSize: 10 },
  balance: { ...typography.display, color: colors.text, fontSize: 42, marginTop: 8 },
  note: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 8 },
  section: { ...typography.bodyBold, color: colors.text, fontSize: 18, marginTop: 26, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { ...typography.bodySemi, color: colors.text, textTransform: 'capitalize' },
  rowMeta: { ...typography.body, color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  amount: { ...typography.bodyBold, color: colors.success },
  debit: { color: colors.text },
  error: { ...typography.body, color: colors.danger, marginTop: 14 },
  empty: { ...typography.body, color: colors.textSecondary, paddingVertical: 14 },
});
