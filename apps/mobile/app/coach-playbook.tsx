import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type Coach = {
  first_name?: string;
  last_name?: string;
  photo_url?: string | null;
};

type PlaybookPost = {
  id: string;
  coach_id: string;
  title: string;
  caption?: string | null;
  category: string;
  duration_seconds: number;
  created_at: string;
  videoUrl: string | null;
  helpfulCount: number;
  viewerHelpful: boolean;
  viewerSaved: boolean;
  canDelete: boolean;
  athletes?: Coach | Coach[] | null;
};

const CATEGORIES = [
  ['all', 'All'],
  ['coaching', 'Coaching'],
  ['facilities', 'Getting mat space'],
  ['session_ideas', 'Session ideas'],
  ['parent_communication', 'Parents'],
  ['business', 'Business'],
  ['recruiting', 'Recruiting'],
] as const;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function label(category: string) {
  return CATEGORIES.find(([value]) => value === category)?.[1] ?? 'Coach advice';
}

function PlaybookCard({
  post,
  onToggle,
  onDelete,
}: {
  post: PlaybookPost;
  onToggle: (post: PlaybookPost, action: 'helpful' | 'save') => void;
  onDelete: (post: PlaybookPost) => void;
}) {
  const coach = one(post.athletes);
  const coachName = [coach?.first_name, coach?.last_name].filter(Boolean).join(' ') || 'Guild coach';
  const player = useVideoPlayer(post.videoUrl, (instance) => {
    instance.loop = false;
  });

  return (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        {coach?.photo_url ? (
          <Image source={{ uri: coach.photo_url }} style={styles.avatar} resizeMode="contain" />
        ) : (
          <View style={styles.avatarFallback}><Text style={styles.avatarLetter}>{coachName[0]}</Text></View>
        )}
        <View style={styles.authorCopy}>
          <Text style={styles.author}>{coachName}</Text>
          <Text style={styles.meta}>
            {label(post.category)} · {post.duration_seconds}s ·{' '}
            {new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>
        </View>
      </View>
      <Text style={styles.title}>{post.title}</Text>
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
      {post.videoUrl ? (
        <VideoView
          player={player}
          style={styles.video}
          nativeControls
          contentFit="contain"
          fullscreenOptions={{ enable: true }}
        />
      ) : (
        <View style={[styles.video, styles.videoMissing]}>
          <Text style={styles.meta}>Video unavailable. Pull to refresh.</Text>
        </View>
      )}
      <View style={styles.actions}>
        <Pressable
          style={[styles.action, post.viewerHelpful && styles.actionSelected]}
          onPress={() => onToggle(post, 'helpful')}
        >
          <Text style={[styles.actionText, post.viewerHelpful && styles.actionTextSelected]}>
            Helpful · {post.helpfulCount}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.action, post.viewerSaved && styles.actionSelected]}
          onPress={() => onToggle(post, 'save')}
        >
          <Text style={[styles.actionText, post.viewerSaved && styles.actionTextSelected]}>
            {post.viewerSaved ? 'Saved' : 'Save'}
          </Text>
        </Pressable>
        {post.canDelete ? (
          <Pressable style={styles.deleteAction} onPress={() => onDelete(post)}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function CoachPlaybookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ coachId?: string; coachName?: string }>();
  const coachId = Array.isArray(params.coachId) ? params.coachId[0] : params.coachId;
  const coachName = Array.isArray(params.coachName) ? params.coachName[0] : params.coachName;
  const [posts, setPosts] = useState<PlaybookPost[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (search.trim()) params.set('search', search.trim());
    if (savedOnly) params.set('saved', 'true');
    if (coachId) params.set('coachId', coachId);
    return params.toString();
  }, [category, coachId, savedOnly, search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ posts: PlaybookPost[] }>(
        `/api/coach-playbook/posts${query ? `?${query}` : ''}`
      );
      setPosts(data.posts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Coach Playbook');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function toggle(post: PlaybookPost, action: 'helpful' | 'save') {
    const key = action === 'helpful' ? 'viewerHelpful' : 'viewerSaved';
    const active = !post[key];
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? {
              ...item,
              [key]: active,
              helpfulCount:
                action === 'helpful'
                  ? Math.max(0, item.helpfulCount + (active ? 1 : -1))
                  : item.helpfulCount,
            }
          : item
      )
    );
    try {
      await apiFetch(`/api/coach-playbook/posts/${post.id}/engagement`, {
        method: 'POST',
        body: JSON.stringify({ action, active }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update video');
      await load();
    }
  }

  async function remove(post: PlaybookPost) {
    setError(null);
    try {
      await apiFetch(`/api/coach-playbook/posts/${post.id}`, { method: 'DELETE' });
      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete video');
    }
  }

  return (
    <FlatList
      style={styles.screen}
      data={posts}
      keyExtractor={(post) => post.id}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
      ListHeaderComponent={
        <View>
          <View style={styles.topNav}>
            <Pressable
              style={styles.topNavButton}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)');
              }}
            >
              <Text style={styles.topNavText}>‹ Back to app</Text>
            </Pressable>
            <Pressable style={styles.topNavButton} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.topNavText}>Coach home</Text>
            </Pressable>
          </View>
          <Text style={styles.kicker}>COACHES ONLY</Text>
          <Text style={styles.heading}>{coachName ? `${coachName}'s Playbook` : 'Coach Playbook'}</Text>
          <Text style={styles.sub}>
            {coachName
              ? `Published coaching ideas from ${coachName}.`
              : 'Short, useful ideas from Guild coaches. Share what is working so every coach gets better.'}
          </Text>
          {!coachId ? (
            <Pressable style={styles.primary} onPress={() => router.push('/coach-playbook-add')}>
              <Text style={styles.primaryText}>Record a 60-second tip</Text>
            </Pressable>
          ) : null}
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => void load()}
            placeholder="Search tips"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
          <FlatList
            horizontal
            data={CATEGORIES}
            keyExtractor={(item) => item[0]}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.filter, category === item[0] && styles.filterSelected]}
                onPress={() => setCategory(item[0])}
              >
                <Text style={[styles.filterText, category === item[0] && styles.filterTextSelected]}>
                  {item[1]}
                </Text>
              </Pressable>
            )}
          />
          <Pressable style={styles.savedToggle} onPress={() => setSavedOnly((value) => !value)}>
            <Text style={styles.savedText}>{savedOnly ? 'Showing saved videos' : 'Show saved videos'}</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading && posts.length === 0 ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} /> : null}
        </View>
      }
      renderItem={({ item }) => (
        <PlaybookCard post={item} onToggle={(post, action) => void toggle(post, action)} onDelete={(post) => void remove(post)} />
      )}
      ListEmptyComponent={!loading ? <Text style={styles.empty}>No videos match this view yet.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 56 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  topNavButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 2 },
  topNavText: { ...typography.bodyBold, color: colors.accent, fontSize: 13 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 34, marginTop: 6 },
  sub: { ...typography.body, color: colors.textSecondary, lineHeight: 21, marginTop: 6 },
  primary: { backgroundColor: colors.accent, minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 4, marginTop: 18 },
  primaryText: { ...typography.bodyBold, color: colors.black },
  search: { ...typography.body, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 5, minHeight: 48, paddingHorizontal: 14, marginTop: 14 },
  filters: { gap: 8, paddingVertical: 12 },
  filter: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 18 },
  filterSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  filterText: { ...typography.bodySemi, color: colors.textSecondary, fontSize: 12 },
  filterTextSelected: { color: colors.accent },
  savedToggle: { alignSelf: 'flex-start', paddingVertical: 6 },
  savedText: { ...typography.bodySemi, color: colors.accent, fontSize: 12 },
  error: { ...typography.body, color: colors.danger, marginTop: 8 },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, overflow: 'hidden', marginTop: 16 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingBottom: 7 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.black },
  avatarFallback: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { ...typography.bodyBold, color: colors.accent },
  authorCopy: { flex: 1 },
  author: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  meta: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 2 },
  title: { ...typography.bodyBold, color: colors.text, fontSize: 19, paddingHorizontal: 14, marginTop: 5 },
  caption: { ...typography.body, color: colors.textSecondary, paddingHorizontal: 14, marginTop: 5, marginBottom: 10 },
  video: { width: '100%', aspectRatio: 9 / 12, backgroundColor: colors.black, marginTop: 12 },
  videoMissing: { alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12 },
  action: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 12 },
  actionSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  actionText: { ...typography.bodySemi, color: colors.textSecondary, fontSize: 12 },
  actionTextSelected: { color: colors.accent },
  deleteAction: { marginLeft: 'auto', padding: 7 },
  deleteText: { ...typography.bodySemi, color: colors.danger, fontSize: 12 },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: 36 },
});
