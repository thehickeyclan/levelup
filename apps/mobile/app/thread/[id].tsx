import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Message = {
  id: string;
  body?: string | null;
  content?: string | null;
  created_at: string;
  sender_id?: string;
};

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ messages: Message[] }>(
        `/api/guild/messages/threads/${id}`
      );
      setMessages(res.messages ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`thread:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'guild_messages',
          filter: `thread_id=eq.${id}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

  if (loading && messages.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={messages}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      renderItem={({ item }) => (
        <View style={styles.bubble}>
          <Text style={styles.body}>{item.body ?? item.content ?? ''}</Text>
          <Text style={styles.meta}>{new Date(item.created_at).toLocaleString()}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.meta}>No messages in this thread.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  body: { fontSize: 15, lineHeight: 20 },
  meta: { marginTop: 6, color: colors.textSecondary, fontSize: 12 },
  error: { color: colors.danger, marginBottom: 8 },
});
