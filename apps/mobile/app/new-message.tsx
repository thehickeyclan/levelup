import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';

type Coach = {
  id: string;
  firstName: string;
  lastName: string;
  school?: string;
};

type Contact = {
  id: string;
  kind: 'parent' | 'youth';
  name: string;
  email?: string;
  kids?: string[];
};

type ConversationTarget = {
  id: string;
  title: string;
  subtitle: string;
  kind: 'coach' | 'parent' | 'youth';
};

export default function NewMessageScreen() {
  const router = useRouter();
  const { isCoachView } = useAuth();
  const isCoach = isCoachView;
  const [targets, setTargets] = useState<ConversationTarget[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isCoach) {
        const data = await apiFetch<{ contacts?: Contact[] }>('/api/inbox/parents-for-athlete');
        setTargets(
          (data.contacts ?? []).map((contact) => ({
            id: contact.id,
            title: contact.name,
            subtitle:
              contact.kind === 'youth'
                ? 'Athlete · linked guardians can see this conversation'
                : contact.kids?.length
                  ? `Parent of ${contact.kids.join(', ')}`
                  : contact.email ?? 'Parent',
            kind: contact.kind,
          }))
        );
      } else {
        const data = await apiFetch<{ coaches?: Coach[] }>('/api/inbox/coaches');
        setTargets(
          (data.coaches ?? []).map((coach) => ({
            id: coach.id,
            title: `${coach.firstName} ${coach.lastName}`.trim() || 'Coach',
            subtitle: coach.school || 'Guild coach',
            kind: 'coach',
          }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load contacts');
    } finally {
      setLoading(false);
    }
  }, [isCoach]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return targets;
    return targets.filter(
      (target) =>
        target.title.toLowerCase().includes(query) ||
        target.subtitle.toLowerCase().includes(query)
    );
  }, [search, targets]);

  const openConversation = async (target: ConversationTarget) => {
    if (openingId) return;
    setOpeningId(target.id);
    setError(null);
    try {
      const data = await apiFetch<{ threadId: string }>('/api/guild/messages/coach-inquiry', {
        method: 'POST',
        body: JSON.stringify(
          isCoach
            ? { parentId: target.id, senderMode: 'coach' }
            : { coachUserId: target.id, senderMode: 'family' }
        ),
      });
      router.replace(`/thread/${data.threadId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start conversation');
      setOpeningId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.heading}>{isCoach ? 'Message a family' : 'Message a coach'}</Text>
        <Text style={styles.subheading}>
          {isCoach
            ? 'Only families registered for one of your sessions are shown.'
            : 'Choose a coach to start or continue a conversation.'}
        </Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={isCoach ? 'Search parents or athletes…' : 'Search coaches or schools…'}
          placeholderTextColor={colors.textSecondary}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => void openConversation(item)}
              disabled={openingId !== null}
              accessibilityRole="button"
              accessibilityLabel={`Message ${item.title}`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.title.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle} numberOfLines={2}>{item.subtitle}</Text>
              </View>
              {openingId === item.id ? <ActivityIndicator color={colors.accent} /> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search.trim() ? 'No contacts match your search.' : 'No contacts available yet.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { padding: 20, paddingBottom: 12, gap: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 26 },
  subheading: { ...typography.body, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  search: {
    ...typography.body,
    minHeight: 46,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: { ...typography.body, color: colors.danger, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.bodyBold, color: colors.accent, fontSize: 16 },
  rowText: { flex: 1 },
  title: { ...typography.bodySemi, color: colors.text, fontSize: 15 },
  subtitle: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 3 },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingTop: 40 },
});
