import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
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
  const [coach, setCoach] = useState<Coach | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from('athletes')
          .select('id, first_name, last_name, school, photo_url, bio, average_rating, review_count')
          .eq('id', id)
          .eq('active', true)
          .maybeSingle();
        if (qErr) throw new Error(qErr.message);
        if (!cancelled) {
          setCoach((data as Coach | null) ?? null);
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {coach.photo_url ? (
        <Image source={{ uri: coach.photo_url }} style={styles.photo} />
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

      <Pressable style={styles.button} onPress={() => router.push(`/book/${coach.id}`)}>
        <Text style={styles.buttonText}>Book a private</Text>
      </Pressable>
      <Pressable
        style={styles.buttonSecondary}
        onPress={() =>
          router.push({ pathname: '/(tabs)/find', params: { tab: 'groups' } })
        }
      >
        <Text style={styles.buttonSecondaryText}>Browse small groups</Text>
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
    backgroundColor: colors.surface,
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
  buttonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 15,
    letterSpacing: 0.4,
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
  buttonSecondaryText: {
    ...typography.bodyBold,
    color: colors.accent,
    fontSize: 15,
    letterSpacing: 0.4,
  },
  error: { color: colors.danger, fontFamily: 'Inter_400Regular' },
});
