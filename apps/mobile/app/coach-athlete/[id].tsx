import { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import {
  fetchCoachAthletes,
  milestoneFor,
  type CoachAthlete,
  type CoachAthleteSession,
} from '@/lib/coach-athletes';
import { sessionTypeLabel } from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function profileMeta(athlete: CoachAthlete): string[] {
  return [
    athlete.age != null ? `Age ${athlete.age}` : null,
    athlete.weightClass,
    athlete.skillLevel,
    athlete.graduationYear ? `Class of ${athlete.graduationYear}` : null,
  ].filter((value): value is string => Boolean(value));
}

function isCompletedRegistration(session: CoachAthleteSession, now: number): boolean {
  return (
    session.status !== 'cancelled' &&
    session.status !== 'pending_payment' &&
    session.status !== 'no-show' &&
    new Date(session.scheduledDatetime).getTime() < now
  );
}

function SessionRow({ session }: { session: CoachAthleteSession }) {
  const router = useRouter();
  const isPast = new Date(session.scheduledDatetime).getTime() < Date.now();
  return (
    <Pressable style={styles.sessionRow} onPress={() => router.push(`/session/${session.id}`)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sessionType}>{sessionTypeLabel(session.sessionType).toUpperCase()}</Text>
        <Text style={styles.sessionTitle}>{session.focusArea?.trim() || formatWhen(session.scheduledDatetime)}</Text>
        {session.focusArea?.trim() ? (
          <Text style={styles.sessionMeta}>{formatWhen(session.scheduledDatetime)}</Text>
        ) : null}
        {session.facilityName ? <Text style={styles.sessionMeta}>{session.facilityName}</Text> : null}
      </View>
      <Text style={[styles.sessionStatus, { color: isPast ? colors.textSecondary : colors.success }]}>
        {isPast ? 'Completed' : 'Upcoming'}
      </Text>
    </Pressable>
  );
}

export default function CoachAthleteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [athlete, setAthlete] = useState<CoachAthlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setAthlete((await fetchCoachAthletes(id))[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load athlete');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const sections = useMemo(() => {
    const history = athlete?.history ?? [];
    const now = Date.now();
    return {
      upcoming: history
        .filter((session) => new Date(session.scheduledDatetime).getTime() >= now && session.status === 'scheduled')
        .sort(
          (a, b) =>
            new Date(a.scheduledDatetime).getTime() - new Date(b.scheduledDatetime).getTime()
        ),
      past: history
        .filter((session) => isCompletedRegistration(session, now))
        .sort(
          (a, b) =>
            new Date(b.scheduledDatetime).getTime() - new Date(a.scheduledDatetime).getTime()
        ),
    };
  }, [athlete]);

  async function messageFamily() {
    if (!athlete?.parentId || messaging) return;
    setMessaging(true);
    setError(null);
    try {
      const data = await apiFetch<{ threadId: string }>('/api/guild/messages/coach-inquiry', {
        method: 'POST',
        body: JSON.stringify({ parentId: athlete.parentId }),
      });
      router.push(`/thread/${data.threadId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not message family');
      setMessaging(false);
    }
  }

  if (loading && !athlete) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!athlete) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Athlete not found in your session history.'}</Text>
      </View>
    );
  }

  const milestone = milestoneFor(athlete.completedGuildSessions);
  const meta = profileMeta(athlete);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
    >
      <View style={styles.hero}>
        {athlete.photoUrl ? (
          <Image source={{ uri: athlete.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{athlete.firstName.charAt(0) || '?'}</Text>
          </View>
        )}
        <Text style={styles.kicker}>ATHLETE</Text>
        <Text style={styles.heading}>{athlete.firstName} {athlete.lastName}</Text>
        {athlete.school ? <Text style={styles.school}>{athlete.school}</Text> : null}
        {meta.length ? <Text style={styles.meta}>{meta.join(' · ')}</Text> : null}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{athlete.sessionsWithCoach}</Text>
          <Text style={styles.statLabel}>Sessions with you</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{athlete.completedGuildSessions}</Text>
          <Text style={styles.statLabel}>Completed Guild sessions</Text>
        </View>
      </View>

      <View style={styles.milestoneCard}>
        <View style={styles.milestoneTop}>
          <View>
            <Text style={styles.sectionKicker}>GUILD MILESTONES</Text>
            <Text style={styles.milestoneTitle}>
              {milestone.earned ? `${milestone.earned}-Session Club` : 'First milestone: 10 sessions'}
            </Text>
          </View>
          {milestone.earned ? (
            <View style={styles.milestoneBadge}>
              <Text style={styles.milestoneNumber}>{milestone.earned}</Text>
              <Text style={styles.milestoneLabel}>CLUB</Text>
            </View>
          ) : null}
        </View>
        {milestone.next ? (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${milestone.progress * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {athlete.completedGuildSessions} of {milestone.next} · {milestone.next - athlete.completedGuildSessions} to go
            </Text>
          </>
        ) : (
          <Text style={styles.century}>Century Club achieved.</Text>
        )}
      </View>

      <Pressable
        style={[styles.messageButton, !athlete.parentId && styles.disabled]}
        onPress={() => void messageFamily()}
        disabled={!athlete.parentId || messaging}
      >
        {messaging ? (
          <ActivityIndicator color={colors.black} />
        ) : (
          <Text style={styles.messageButtonText}>
            {athlete.parentId ? 'Message family' : 'No linked family account'}
          </Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {sections.upcoming.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionKicker}>UPCOMING WITH YOU</Text>
          {sections.upcoming.map((session) => <SessionRow key={session.id} session={session} />)}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionKicker}>SESSION HISTORY WITH YOU</Text>
        {sections.past.length > 0 ? (
          sections.past.map((session) => <SessionRow key={session.id} session={session} />)
        ) : (
          <Text style={styles.empty}>No completed sessions yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  hero: { alignItems: 'center', paddingBottom: 18 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface },
  avatarPlaceholder: {
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.display, color: colors.accent, fontSize: 32 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginTop: 14 },
  heading: { ...typography.display, color: colors.text, fontSize: 30, textAlign: 'center', marginTop: 5 },
  school: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 4 },
  meta: {
    ...typography.bodyMedium,
    color: colors.accentLight,
    fontSize: 12,
    marginTop: 7,
    textTransform: 'capitalize',
  },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    minHeight: 82,
    padding: 12,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { ...typography.display, color: colors.text, fontSize: 25 },
  statLabel: { ...typography.body, color: colors.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 2 },
  milestoneCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 6,
    padding: 14,
    marginTop: 10,
  },
  milestoneTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionKicker: { ...typography.brand, color: colors.accent, fontSize: 9 },
  milestoneTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15, marginTop: 5 },
  milestoneBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneNumber: { ...typography.bodyBold, color: colors.accent, fontSize: 17 },
  milestoneLabel: { ...typography.bodyBold, color: colors.accent, fontSize: 7, letterSpacing: 1 },
  progressTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginTop: 14 },
  progressFill: { height: 5, backgroundColor: colors.accent },
  progressText: { ...typography.body, color: colors.textMuted, fontSize: 10, marginTop: 6 },
  century: { ...typography.bodyBold, color: colors.accent, fontSize: 12, marginTop: 12 },
  messageButton: {
    minHeight: 50,
    marginTop: 12,
    borderRadius: 4,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  disabled: { opacity: 0.4 },
  error: { ...typography.body, color: colors.danger, fontSize: 12, textAlign: 'center', marginTop: 10 },
  section: { marginTop: 24 },
  sessionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sessionType: { ...typography.brand, color: colors.accent, fontSize: 8 },
  sessionTitle: { ...typography.bodySemi, color: colors.text, fontSize: 14, marginTop: 4 },
  sessionMeta: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 3 },
  sessionStatus: { ...typography.bodySemi, fontSize: 10 },
  empty: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 12 },
});
