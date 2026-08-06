import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';
import { mobileActivityTitle, type MobileActivityPost } from '@/lib/activity-display';

type FeedPost = MobileActivityPost & {
  id: string;
  trigger_type: string;
  created_at: string;
  caption?: string | null;
  kudos_count?: number;
  youth_wrestlers?: { first_name?: string; last_name?: string; photo_url?: string } | null;
  athletes?: { first_name?: string; last_name?: string; photo_url?: string } | null;
  sessions?: { session_type?: string; scheduled_datetime?: string; facilities?: { name?: string } | null } | null;
  reviews?: { rating?: number; comment?: string } | null;
  photos?: { id: string; url: string }[];
};

type PhotoSession = {
  id: string;
  scheduled_datetime: string;
  facilityName: string;
  coachName: string;
  wrestlers: { id: string; name: string }[];
};

type PlaybookPreview = {
  id: string;
  title: string;
  category: string;
  duration_seconds: number;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function ActivityScreen() {
  const { isCoachView, role } = useAuth();
  const router = useRouter();
  const isAthlete = role === 'youth_wrestler';
  const [scope, setScope] = useState<'community' | 'family' | 'coach'>(isCoachView ? 'coach' : 'family');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [photoSessions, setPhotoSessions] = useState<PhotoSession[]>([]);
  const [playbook, setPlaybook] = useState<PlaybookPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [feed, eligible, coachTips] = await Promise.all([
        apiFetch<{ posts: FeedPost[] }>(`/api/activity/feed?scope=${scope}&limit=30`),
        apiFetch<{ sessions: PhotoSession[] }>('/api/activity/photo-sessions'),
        isCoachView
          ? apiFetch<{ posts: PlaybookPreview[] }>('/api/coach-playbook/posts?limit=3')
              .catch(() => ({ posts: [] }))
          : Promise.resolve({ posts: [] }),
      ]);
      setPosts(feed.posts ?? []);
      setPhotoSessions(eligible.sessions ?? []);
      setPlaybook(coachTips.posts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity');
    } finally {
      setLoading(false);
    }
  }, [isCoachView, scope]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function addPhotos(session: PhotoSession) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is required to share session photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    setUploadingId(session.id);
    setError(null);
    try {
      const form = new FormData();
      form.append('sessionId', session.id);
      if (!isCoachView && session.wrestlers[0]?.id) {
        form.append('youthWrestlerId', session.wrestlers[0].id);
      }
      for (const [index, asset] of result.assets.entries()) {
        form.append('photos', {
          uri: asset.uri,
          name: asset.fileName || `activity-${index + 1}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        } as unknown as Blob);
      }
      await apiFetch('/api/activity/photos', { method: 'POST', body: form });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share photos');
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <Text style={styles.kicker}>THE GUILD</Text>
      <Text style={styles.heading}>Activity</Text>
      <Text style={styles.sub}>
        {isCoachView
          ? 'Bookings, coach updates, photos, reviews, and Market activity.'
          : isAthlete
            ? 'Your training, coaches you follow, photos, milestones, and Guild updates.'
            : 'Training, new coaches, photos, reviews, and Market updates.'}
      </Text>

      <View style={styles.tabs}>
        {(isCoachView
          ? [['coach', 'My activity'], ['community', 'Community']]
          : isAthlete
            ? [['family', 'My training'], ['community', 'Guild']]
            : [['family', 'My family'], ['community', 'Community']]
        ).map(([value, label]) => (
          <Pressable key={value} style={[styles.tab, scope === value && styles.tabSelected]} onPress={() => setScope(value as typeof scope)}>
            <Text style={[styles.tabText, scope === value && styles.tabTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {isCoachView ? (
        <View style={styles.playbookBox}>
          <View style={styles.playbookHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.playbookKicker}>COACHES ONLY</Text>
              <Text style={styles.playbookTitle}>Coach Playbook</Text>
              <Text style={styles.playbookSub}>Practical ideas from coaches in 60 seconds or less.</Text>
            </View>
            <Pressable onPress={() => router.push('/coach-playbook')}>
              <Text style={styles.playbookOpen}>View all</Text>
            </Pressable>
          </View>
          {playbook.map((tip) => (
            <Pressable key={tip.id} style={styles.tipRow} onPress={() => router.push('/coach-playbook')}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <Text style={styles.tipMeta}>{tip.category.replaceAll('_', ' ')} · {tip.duration_seconds}s</Text>
              </View>
              <Text style={styles.tipArrow}>›</Text>
            </Pressable>
          ))}
          <Pressable style={styles.addTip} onPress={() => router.push('/coach-playbook-add')}>
            <Text style={styles.addTipText}>+ Share a coach tip</Text>
          </Pressable>
        </View>
      ) : null}

      {photoSessions.length > 0 ? (
        <View style={styles.shareBox}>
          <Text style={styles.shareTitle}>{isAthlete ? 'Add photos from training' : 'Share session photos'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sessionRow}>
            {photoSessions.slice(0, 8).map((session) => (
              <Pressable key={session.id} style={styles.sessionChip} onPress={() => void addPhotos(session)} disabled={Boolean(uploadingId)}>
                <Text style={styles.sessionDate}>{new Date(session.scheduled_datetime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                <Text style={styles.sessionMeta} numberOfLines={1}>{session.coachName} · {session.facilityName}</Text>
                <Text style={styles.addText}>{uploadingId === session.id ? 'Uploading…' : '+ Add photos'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && posts.length === 0 ? <ActivityIndicator color={colors.accent} /> : null}
      {posts.map((post) => {
        const avatar = one(post.athletes)?.photo_url || one(post.youth_wrestlers)?.photo_url;
        const session = one(post.sessions);
        const review = one(post.reviews);
        return (
          <View key={post.id} style={styles.card}>
            <View style={styles.cardTop}>
              {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : <View style={styles.avatarFallback} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{mobileActivityTitle(post)}</Text>
                <Text style={styles.time}>{new Date(post.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
            </View>
            {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
            {session ? <Text style={styles.detail}>{session.session_type?.replaceAll('_', ' ')}{one(session.facilities)?.name ? ` · ${one(session.facilities)?.name}` : ''}</Text> : null}
            {review?.rating ? <Text style={styles.rating}>{'★'.repeat(Math.round(review.rating))} {review.comment ?? ''}</Text> : null}
            {post.photos?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
                {post.photos.map((photo) => <Image key={photo.id} source={{ uri: photo.url }} style={styles.photo} />)}
              </ScrollView>
            ) : null}
            <Text style={styles.kudos}>{post.kudos_count || 0} reactions</Text>
          </View>
        );
      })}
      {!loading && posts.length === 0 ? <Text style={styles.empty}>No activity yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 34, marginTop: 6 },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 6 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 18 },
  tab: { borderWidth: 1, borderColor: colors.border, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20 },
  tabSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  tabText: { ...typography.bodySemi, color: colors.textSecondary, fontSize: 13 },
  tabTextSelected: { color: colors.accent },
  shareBox: { marginTop: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 },
  playbookBox: { marginTop: 18, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.surface, padding: 14 },
  playbookHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  playbookKicker: { ...typography.brand, color: colors.accent, fontSize: 9 },
  playbookTitle: { ...typography.display, color: colors.text, fontSize: 23, marginTop: 3 },
  playbookSub: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  playbookOpen: { ...typography.bodyBold, color: colors.accent, fontSize: 12, paddingVertical: 4 },
  tipRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10, marginTop: 8 },
  tipTitle: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  tipMeta: { ...typography.body, color: colors.textMuted, fontSize: 10, marginTop: 2, textTransform: 'capitalize' },
  tipArrow: { ...typography.body, color: colors.accent, fontSize: 22 },
  addTip: { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  addTipText: { ...typography.bodyBold, color: colors.accent, fontSize: 12 },
  shareTitle: { ...typography.bodyBold, color: colors.text },
  sessionRow: { gap: 10, paddingTop: 10 },
  sessionChip: { width: 190, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 6 },
  sessionDate: { ...typography.bodyBold, color: colors.text },
  sessionMeta: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  addText: { ...typography.bodyBold, color: colors.accent, fontSize: 12, marginTop: 8 },
  error: { ...typography.body, color: colors.danger, marginTop: 14 },
  card: { marginTop: 14, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface },
  avatarFallback: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceRaised },
  cardTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  time: { ...typography.body, color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  caption: { ...typography.body, color: colors.text, marginTop: 10 },
  detail: { ...typography.body, color: colors.textSecondary, fontSize: 13, marginTop: 8, textTransform: 'capitalize' },
  rating: { ...typography.body, color: colors.accent, marginTop: 8 },
  photos: { gap: 8, paddingTop: 10 },
  photo: { width: 220, height: 180, borderRadius: 6, backgroundColor: colors.surface },
  kudos: { ...typography.body, color: colors.textSecondary, fontSize: 11, marginTop: 8 },
  empty: { ...typography.body, color: colors.textSecondary, marginTop: 30, textAlign: 'center' },
});
