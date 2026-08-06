import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';

type Coach = {
  id: string;
  first_name: string;
  last_name: string;
  school: string | null;
  photo_url: string | null;
  bio: string | null;
  average_rating: number | null;
  review_count: number | null;
};

export default function CoachDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, role, isCoachView, selectedCoachId } = useAuth();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [openingMessage, setOpeningMessage] = useState(false);
  const [following, setFollowing] = useState(false);
  const [savingFollow, setSavingFollow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ data, error: qErr }, follow] = await Promise.all([
          supabase
          .from('athletes')
          .select('id, first_name, last_name, school, photo_url, bio, average_rating, review_count')
          .eq('id', id)
          .eq('active', true)
          .maybeSingle(),
          apiFetch<{ following: boolean }>(`/api/coach-follows/check?coachId=${id}`).catch(() => ({ following: false })),
        ]);
        if (qErr) throw new Error(qErr.message);
        if (!cancelled) {
          setCoach((data as Coach | null) ?? null);
          setFollowing(follow.following);
          if (!data) setError('Coach not found');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!coach && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!coach) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  const coachId = coach.id;
  const coachFirstName = coach.first_name;
  const coachName = `${coach.first_name} ${coach.last_name}`.trim();
  const currentCoachId =
    role === 'admin' ? selectedCoachId : role === 'coach' ? user?.id ?? null : null;
  const isSelf = currentCoachId === coachId;

  async function messageCoach() {
    if (openingMessage) return;
    setOpeningMessage(true);
    setMessageError(null);
    try {
      const data = await apiFetch<{ threadId: string }>('/api/guild/messages/coach-inquiry', {
        method: 'POST',
        body: JSON.stringify({
          coachUserId: coachId,
          senderMode: isCoachView ? 'coach' : 'family',
        }),
      });
      router.push({
        pathname: '/thread/[id]',
        params: {
          id: data.threadId,
          ...(isCoachView
            ? {}
            : { draft: `Hi ${coachFirstName}, are you available for training?` }),
        },
      });
    } catch (e) {
      setMessageError(e instanceof Error ? e.message : 'Could not open conversation');
      setOpeningMessage(false);
    }
  }

  async function toggleFollow() {
    if (savingFollow || isSelf) return;
    setSavingFollow(true);
    setError(null);
    try {
      if (following) {
        await apiFetch(`/api/coach-follows?coachId=${coachId}`, { method: 'DELETE' });
      } else {
        await apiFetch('/api/coach-follows', {
          method: 'POST',
          body: JSON.stringify({ coachId }),
        });
      }
      setFollowing(!following);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update follow');
    } finally {
      setSavingFollow(false);
    }
  }

  async function shareProfile() {
    const publicUrl = `${API_URL}/coach/${coachId}`;
    await Share.share({
      title: `${coachName} · The Guild`,
      message: `View ${coachName}'s Guild coach profile and every upcoming session: ${publicUrl}`,
      url: publicUrl,
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {coach.photo_url ? (
        <Image source={{ uri: coach.photo_url }} style={styles.photo} resizeMode="contain" />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]} />
      )}
      <Text style={styles.name}>
        {coach.first_name} {coach.last_name}
      </Text>
      <Text style={styles.meta}>{coach.school}</Text>
      {coach.review_count ? (
        <Text style={styles.meta}>
          ★ {Number(coach.average_rating ?? 0).toFixed(1)} · {coach.review_count} reviews
        </Text>
      ) : null}
      {coach.bio ? <Text style={styles.bio}>{coach.bio}</Text> : null}

      {!isSelf ? (
        <Pressable style={styles.followButton} onPress={() => void toggleFollow()} disabled={savingFollow}>
          <Text style={styles.followButtonText}>
            {savingFollow ? 'Saving…' : following ? 'Following · Alerts on' : 'Follow coach'}
          </Text>
        </Pressable>
      ) : (
        <Pressable style={styles.followButton} onPress={() => router.push('/coach-profile-edit')}>
          <Text style={styles.followButtonText}>Edit your profile</Text>
        </Pressable>
      )}

      <Pressable
        style={styles.button}
        onPress={() =>
          isCoachView
            ? router.push(`/coach-public-availability/${coach.id}`)
            : router.push(`/book/${coach.id}`)
        }
      >
        <Text style={styles.buttonText}>
          {isCoachView ? 'View public availability' : 'View availability & book'}
        </Text>
      </Pressable>
      {!isSelf ? (
        <>
          <Text style={styles.availabilityHelp}>
            Connect directly for referrals, training questions, or another available time.
          </Text>
          <Pressable
            style={[styles.buttonSecondary, openingMessage && styles.buttonDisabled]}
            onPress={() => void messageCoach()}
            disabled={openingMessage}
            accessibilityRole="button"
            accessibilityLabel={isCoachView ? `Message ${coachName}` : `Ask ${coachName} about availability`}
            accessibilityState={{ disabled: openingMessage, busy: openingMessage }}
          >
            <Text style={styles.buttonSecondaryText}>
              {openingMessage ? 'Opening…' : isCoachView ? 'Message coach' : 'Ask coach about availability'}
            </Text>
          </Pressable>
          {messageError ? (
            <View style={styles.actionError} accessibilityRole="alert">
              <Text style={styles.actionErrorText}>{messageError}</Text>
              <Pressable
                onPress={() => void messageCoach()}
                disabled={openingMessage}
                accessibilityRole="button"
                accessibilityLabel="Try opening the coach conversation again"
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}
      {isCoachView ? (
        <Pressable
          style={styles.buttonSecondary}
          onPress={() =>
            router.push({
              pathname: '/coach-playbook',
              params: {
                coachId,
                coachName: `${coach.first_name} ${coach.last_name}`,
              },
            })
          }
        >
          <Text style={styles.buttonSecondaryText}>View Coach Playbook posts</Text>
        </Pressable>
      ) : (
        <Pressable
          style={styles.buttonSecondary}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/find',
              params: { tab: 'groups', coachId, coachName },
            })
          }
        >
          <Text style={styles.buttonSecondaryText}>Browse small groups</Text>
        </Pressable>
      )}
      <Pressable
        style={styles.shareButton}
        onPress={() => (isSelf ? router.push('/coach-share') : void shareProfile())}
      >
        <Text style={styles.shareButtonText}>
          {isSelf ? 'Share profile, sessions & QR' : 'Share coach profile & sessions'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  container: { padding: 20, paddingBottom: 40 },
  photo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    backgroundColor: colors.black,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  photoPlaceholder: { backgroundColor: colors.surfaceRaised },
  name: { ...typography.display, fontSize: 28, color: colors.text, marginTop: 16 },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  bio: {
    ...typography.body,
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  button: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followButton: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  followButtonText: { ...typography.bodyBold, color: colors.accent, fontSize: 14 },
  buttonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 15,
    letterSpacing: 0.4,
  },
  availabilityHelp: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  buttonSecondary: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonSecondaryText: {
    ...typography.bodyBold,
    color: colors.accent,
    fontSize: 15,
    letterSpacing: 0.4,
  },
  shareButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  shareButtonText: { ...typography.bodySemi, color: colors.textSecondary, fontSize: 13 },
  actionError: {
    marginTop: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  actionErrorText: { ...typography.body, color: colors.danger, fontSize: 13, lineHeight: 18 },
  retryText: { ...typography.bodyBold, color: colors.accent, fontSize: 13, marginTop: 8 },
  error: { color: colors.danger, fontFamily: 'Inter_400Regular' },
});
