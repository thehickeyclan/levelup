import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type Thread = {
  id: string;
  label?: string;
  title?: string | null;
  thread_type?: string;
  preview?: string | null;
  last_message_preview?: string | null;
  unread?: number;
  unread_count?: number;
};

export default function InboxScreen() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<{ threads?: Thread[]; inbox?: Thread[] }>(
        '/api/guild/messages/inbox'
      );
      setThreads(res.threads ?? res.inbox ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load inbox');
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

  if (loading && threads.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      data={threads}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load()}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.kicker}>MESSAGES</Text>
          <Text style={styles.heading}>Inbox</Text>
          <Text style={styles.sub}>Session and market conversations.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => router.push(`/thread/${item.id}`)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {item.label ?? item.title ?? item.thread_type ?? 'Conversation'}
              {(item.unread ?? item.unread_count)
                ? ` · ${item.unread ?? item.unread_count}`
                : ''}
            </Text>
            {(item.preview ?? item.last_message_preview) ? (
              <Text style={styles.meta} numberOfLines={2}>
                {item.preview ?? item.last_message_preview}
              </Text>
            ) : null}
          </View>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.sub}>No messages yet.</Text>}
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
  kicker: { ...typography.brand, fontSize: 11, color: colors.accent, marginBottom: 8 },
  heading: { ...typography.display, fontSize: 28, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted, marginTop: 6, fontSize: 14 },
  error: { color: colors.danger, marginTop: 8, fontFamily: 'Inter_400Regular' },
  row: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 56,
  },
  title: { ...typography.bodySemi, fontSize: 15, color: colors.text },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: 4, fontSize: 13 },
});
