import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { getHiddenThreadIds } from '@/lib/moderation';
import { colors, typography } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { MIN_TOUCH_TARGET } from '@/lib/accessibility';

type Thread = {
  id: string;
  label?: string;
  title?: string | null;
  thread_type?: string;
  category?: 'training' | 'direct' | 'marketplace';
  preview?: string | null;
  last_message_preview?: string | null;
  last_at?: string | null;
  unread?: number;
  unread_count?: number;
};

type InboxSection = {
  title: string;
  data: Thread[];
};
type InboxFilter = 'all' | 'unread' | 'training' | 'marketplace';

const MARKET_TYPES = new Set(['trade', 'order', 'dispute', 'offer', 'listing_qa']);

function getCategory(thread: Thread): NonNullable<Thread['category']> {
  if (thread.category) return thread.category;
  if (MARKET_TYPES.has(thread.thread_type ?? '')) return 'marketplace';
  if (thread.thread_type === 'coach_inquiry') return 'direct';
  return 'training';
}

function categoryLabel(thread: Thread) {
  const category = getCategory(thread);
  if (category === 'marketplace') return 'MARKETPLACE';
  if (category === 'direct') return 'DIRECT MESSAGE';
  return 'TRAINING';
}

function cleanTitle(thread: Thread) {
  const raw = thread.title ?? thread.label ?? thread.thread_type ?? 'Conversation';
  return raw.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '').trim();
}

function formatLastAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function InboxScreen() {
  const router = useRouter();
  const { role } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const queryRef = useRef('');
  const [filter, setFilter] = useState<InboxFilter>('all');

  const load = useCallback(async (search = '') => {
    setError(null);
    try {
      const res = await apiFetch<{ threads?: Thread[]; inbox?: Thread[] }>(
        `/api/guild/messages/inbox${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`
      );
      const hidden = await getHiddenThreadIds();
      setThreads((res.threads ?? res.inbox ?? []).filter((thread) => !hidden.has(thread.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load inbox');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load(queryRef.current);
    }, [load])
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      void load(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [load, query]);

  const visibleThreads = useMemo(() => threads.filter((thread) => {
    const unread = (thread.unread ?? thread.unread_count ?? 0) > 0;
    const category = getCategory(thread);
    if (filter === 'unread') return unread;
    if (filter === 'training') return category !== 'marketplace';
    if (filter === 'marketplace') return category === 'marketplace';
    return true;
  }), [filter, threads]);

  if (loading && threads.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const sections: InboxSection[] = [
    {
      title: 'Training & coaches',
      data: visibleThreads.filter((thread) => getCategory(thread) !== 'marketplace'),
    },
    {
      title: 'Marketplace',
      data: visibleThreads.filter((thread) => getCategory(thread) === 'marketplace'),
    },
  ].filter((section) => section.data.length > 0);

  return (
    <SectionList
      style={styles.screen}
      sections={sections}
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
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.heading}>Messages</Text>
            {role === 'parent' || role === 'youth_wrestler' || role === 'coach' || role === 'admin' ? (
              <Pressable
                style={styles.newButton}
                onPress={() => router.push('/new-message')}
                accessibilityRole="button"
                accessibilityLabel="Start a new conversation"
              >
                <Text style={styles.newButtonText}>New message</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.sub}>
            Talk with coaches and families, coordinate training, and manage marketplace questions.
          </Text>
          <TextInput
            value={query}
            onChangeText={(value) => {
              queryRef.current = value;
              setQuery(value);
            }}
            placeholder="Search people, sessions, listings, messages"
            placeholderTextColor={colors.textSecondary}
            style={styles.search}
            returnKeyType="search"
            accessibilityLabel="Search messages"
          />
          <View style={styles.filters}>
            {([
              ['all', 'All'],
              ['unread', 'Unread'],
              ['training', 'Training'],
              ['marketplace', 'Market'],
            ] as [InboxFilter, string][]).map(([value, label]) => {
              const selected = filter === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.filter, selected && styles.filterSelected]}
                  onPress={() => setFilter(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${label} messages`}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.row, (item.unread ?? item.unread_count ?? 0) > 0 && styles.rowUnread]}
          onPress={() => router.push(`/thread/${item.id}`)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{cleanTitle(item).charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.rowContent}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, (item.unread ?? item.unread_count ?? 0) > 0 && styles.titleUnread]}
                numberOfLines={2}
              >
                {cleanTitle(item)}
              </Text>
              <Text style={styles.time}>{formatLastAt(item.last_at)}</Text>
            </View>
            <Text style={styles.kind}>{categoryLabel(item)}</Text>
            {(item.preview ?? item.last_message_preview) ? (
              <Text
                style={[styles.meta, (item.unread ?? item.unread_count ?? 0) > 0 && styles.metaUnread]}
                numberOfLines={2}
              >
                {(item.preview ?? item.last_message_preview) === 'No messages yet'
                  ? 'No messages yet — tap to start'
                  : item.preview ?? item.last_message_preview}
              </Text>
            ) : null}
          </View>
          {(item.unread ?? item.unread_count ?? 0) > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread ?? item.unread_count}</Text>
            </View>
          ) : null}
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {query ? 'No matching conversations' : filter === 'unread' ? 'You’re all caught up' : 'No conversations yet'}
          </Text>
          <Text style={styles.emptyText}>
            {query ? 'Try another name, session, listing, or phrase.' : 'Tap New message to contact a coach or family.'}
          </Text>
        </View>
      }
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
  header: { marginBottom: 22 },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { ...typography.display, fontSize: 28, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted, marginTop: 7, fontSize: 13, lineHeight: 19 },
  search: { ...typography.body, minHeight: 46, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 13, marginTop: 16, fontSize: 13 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  filter: { minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  filterSelected: { borderColor: colors.accent, backgroundColor: 'rgba(184,157,96,0.16)' },
  filterText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 10 },
  filterTextSelected: { color: colors.accent },
  error: { color: colors.danger, marginTop: 8, fontFamily: 'Inter_400Regular' },
  newButton: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonText: { ...typography.bodyBold, color: colors.background, fontSize: 13 },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingTop: 10,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 82,
  },
  rowUnread: { backgroundColor: 'rgba(184,157,96,0.05)', marginHorizontal: -8, paddingHorizontal: 8 },
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
  rowContent: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { ...typography.bodySemi, flex: 1, fontSize: 15, color: colors.text },
  titleUnread: { ...typography.bodyBold },
  time: { ...typography.body, color: colors.textSecondary, fontSize: 11 },
  kind: { ...typography.bodyBold, color: colors.accent, marginTop: 3, fontSize: 9, letterSpacing: 0.8 },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: 4, fontSize: 12 },
  metaUnread: { color: colors.text },
  unreadBadge: {
    minWidth: 22,
    minHeight: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { ...typography.bodyBold, color: colors.black, fontSize: 11 },
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 },
  emptyTitle: { ...typography.bodySemi, color: colors.text, fontSize: 16 },
  emptyText: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },
});
