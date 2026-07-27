import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { typography } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { notifyInboxUnreadChanged } from '@/lib/use-inbox-unread-realtime';

type Message = {
  id: string;
  body?: string | null;
  content?: string | null;
  created_at: string;
  sender_id?: string;
  sender_name?: string;
  read_by?: string[];
};

type DeliveryChannel = 'in_app' | 'sms';

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deliveryChannel, setDeliveryChannel] = useState<DeliveryChannel>('in_app');
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const markRead = useCallback(async () => {
    if (!id) return;
    try {
      await apiFetch(`/api/guild/messages/threads/${id}/read`, { method: 'POST' });
      notifyInboxUnreadChanged();
    } catch {
      // A read receipt should never prevent the conversation from opening.
    }
  }, [id]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ messages: Message[]; unread?: number }>(
        `/api/guild/messages/threads/${id}`
      );
      const nextMessages = res.messages ?? [];
      if ((res.unread ?? 0) > 0 && !firstUnreadId) {
        const firstUnread = nextMessages.find(
          (message) =>
            message.sender_id !== user?.id &&
            !(message.read_by ?? []).includes(user?.id ?? '')
        );
        if (firstUnread) setFirstUnreadId(firstUnread.id);
      }
      setMessages(nextMessages);
      setError(null);
      void markRead();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }, [firstUnreadId, id, markRead, user?.id]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!id || !body || sending) return;
    setSending(true);
    setError(null);
    setDeliveryNotice(null);
    try {
      const res = await apiFetch<{
        message: Message & { sms_recipients?: number };
      }>(`/api/guild/messages/threads/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, deliveryChannel }),
      });
      setDraft('');
      if (deliveryChannel === 'sms') {
        const count = Number(res.message?.sms_recipients ?? 0);
        setDeliveryNotice(
          count > 0
            ? `Text sent to ${count} recipient${count === 1 ? '' : 's'} and saved here.`
            : 'Saved here, but nobody could receive SMS.'
        );
      }
      await load();
      notifyInboxUnreadChanged();
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send message');
    } finally {
      setSending(false);
    }
  }, [deliveryChannel, draft, id, load, sending]);

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
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
        renderItem={({ item }) => {
          const own = item.sender_id === user?.id;
          const seen = own && (item.read_by ?? []).some((readerId) => readerId !== user?.id);
          return (
            <>
              {item.id === firstUnreadId ? (
                <View style={styles.newDivider}>
                  <View style={styles.newLine} />
                  <Text style={styles.newText}>NEW MESSAGES</Text>
                  <View style={styles.newLine} />
                </View>
              ) : null}
              <View style={[styles.messageRow, own && styles.messageRowOwn]}>
                <Text style={[styles.sender, own && styles.senderOwn]}>
                  {own ? 'You' : item.sender_name ?? 'Member'}
                </Text>
                <View style={[styles.bubble, own && styles.bubbleOwn]}>
                  <Text style={[styles.body, own && styles.bodyOwn]}>
                    {item.body ?? item.content ?? ''}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  {new Date(item.created_at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {seen ? ' · Read' : ''}
                </Text>
              </View>
            </>
          );
        }}
        ListEmptyComponent={<Text style={styles.meta}>No messages in this thread.</Text>}
      />
      <View style={styles.composer}>
        <View style={styles.channelRow}>
          {(['in_app', 'sms'] as const).map((channel) => {
            const selected = deliveryChannel === channel;
            return (
              <Pressable
                key={channel}
                style={[styles.channelButton, selected && styles.channelButtonSelected]}
                onPress={() => setDeliveryChannel(channel)}
                disabled={sending}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.channelText, selected && styles.channelTextSelected]}>
                  {channel === 'in_app' ? 'Guild message' : 'SMS'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.channelHint}>
          {deliveryChannel === 'sms'
            ? 'Text the recipients and save a copy here.'
            : 'Send in the Guild with an app notification.'}
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={(value) => setDraft(value.slice(0, 1000))}
            placeholder="Write a message…"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={styles.input}
            editable={!sending}
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
            onPress={() => void send()}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel={deliveryChannel === 'sms' ? 'Send SMS' : 'Send Guild message'}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </Pressable>
        </View>
        {deliveryNotice ? <Text style={styles.notice}>{deliveryNotice}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: 20 },
  messageRow: { alignItems: 'flex-start', marginBottom: 8 },
  messageRowOwn: { alignItems: 'flex-end' },
  newDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  newLine: { flex: 1, height: 1, backgroundColor: colors.accent },
  newText: { ...typography.bodyBold, color: colors.accent, fontSize: 9, letterSpacing: 1 },
  sender: { ...typography.bodySemi, color: colors.textMuted, fontSize: 11, marginBottom: 4 },
  senderOwn: { color: colors.accent },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    maxWidth: '82%',
  },
  bubbleOwn: { backgroundColor: colors.accent, borderColor: colors.accent },
  body: { ...typography.body, color: colors.text, fontSize: 15, lineHeight: 20 },
  bodyOwn: { color: colors.background },
  meta: { marginTop: 6, color: colors.textSecondary, fontSize: 12 },
  error: { color: colors.danger, marginBottom: 8 },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 8,
  },
  channelRow: { flexDirection: 'row', gap: 8 },
  channelButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  channelButtonSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  channelText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 12 },
  channelTextSelected: { color: colors.background },
  channelHint: { ...typography.body, color: colors.textMuted, fontSize: 11 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    ...typography.body,
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendButton: {
    minWidth: 64,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendButtonDisabled: { opacity: 0.45 },
  sendText: { ...typography.bodyBold, color: colors.background, fontSize: 13 },
  notice: { ...typography.body, color: colors.textMuted, fontSize: 11 },
});
