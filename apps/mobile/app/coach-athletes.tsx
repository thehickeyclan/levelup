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
import { useFocusEffect, useRouter } from 'expo-router';
import {
  fetchCoachAthletes,
  milestoneFor,
  type CoachAthlete,
} from '@/lib/coach-athletes';
import { colors, typography } from '@/lib/theme';

function athleteMeta(athlete: CoachAthlete): string {
  return [
    athlete.age != null ? `${athlete.age}y` : null,
    athlete.weightClass,
    athlete.skillLevel,
    athlete.graduationYear ? `Class of ${athlete.graduationYear}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatShortDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CoachAthletesScreen() {
  const router = useRouter();
  const [athletes, setAthletes] = useState<CoachAthlete[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAthletes(await fetchCoachAthletes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load athletes');
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return athletes;
    return athletes.filter((athlete) =>
      [
        athlete.firstName,
        athlete.lastName,
        athlete.school,
        athlete.weightClass,
        athlete.skillLevel,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [athletes, search]);

  const repeatAthletes = athletes.filter((athlete) => athlete.sessionsWithCoach >= 2).length;
  const milestoneAthletes = athletes.filter(
    (athlete) => milestoneFor(athlete.completedGuildSessions).earned != null
  ).length;

  return (
    <View style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(athlete) => athlete.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.kicker}>COACH</Text>
            <Text style={styles.heading}>My Athletes</Text>
            <Text style={styles.sub}>
              Everyone who has registered for one of your sessions.
            </Text>

            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{athletes.length}</Text>
                <Text style={styles.metricLabel}>Athletes</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{repeatAthletes}</Text>
                <Text style={styles.metricLabel}>Returned</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{milestoneAthletes}</Text>
                <Text style={styles.metricLabel}>Milestones</Text>
              </View>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, weight, or skill…"
              placeholderTextColor={colors.textSecondary}
              style={styles.search}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.countNote}>
              Session totals reflect completed Guild registrations. Verified attendance can be added
              separately when coaches record it.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => {
          const meta = athleteMeta(item);
          const milestone = milestoneFor(item.completedGuildSessions);
          const last = formatShortDate(item.lastSessionAt);
          const next = formatShortDate(item.nextSessionAt);
          return (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/coach-athlete/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.firstName} ${item.lastName}`}
            >
              <View style={styles.cardHeader}>
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarText}>{item.firstName.charAt(0) || '?'}</Text>
                  </View>
                )}
                <View style={styles.identity}>
                  <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
                  {item.school ? <Text style={styles.school}>{item.school}</Text> : null}
                  {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                </View>
                <Text style={styles.arrow}>›</Text>
              </View>

              <View style={styles.sessionStats}>
                <View>
                  <Text style={styles.statValue}>{item.sessionsWithCoach}</Text>
                  <Text style={styles.statLabel}>with you</Text>
                </View>
                <View>
                  <Text style={styles.statValue}>{item.completedGuildSessions}</Text>
                  <Text style={styles.statLabel}>Guild sessions</Text>
                </View>
                {milestone.earned ? (
                  <View style={styles.milestoneBadge}>
                    <Text style={styles.milestoneNumber}>{milestone.earned}</Text>
                    <Text style={styles.milestoneLabel}>CLUB</Text>
                  </View>
                ) : null}
              </View>

              {milestone.next ? (
                <View style={styles.progressBlock}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${milestone.progress * 100}%` }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {milestone.next - item.completedGuildSessions} to {milestone.next}-session milestone
                  </Text>
                </View>
              ) : (
                <Text style={styles.century}>Century Club athlete</Text>
              )}

              {next || last ? (
                <Text style={styles.dates}>
                  {next ? `Next ${next}` : ''}{next && last ? ' · ' : ''}{last ? `Last ${last}` : ''}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.accent} style={styles.loading} />
          ) : (
            <Text style={styles.empty}>
              {search.trim()
                ? 'No athletes match that search.'
                : 'Athletes will appear after they register for your first session.'}
            </Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  header: { marginBottom: 14 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 32, marginTop: 6 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 18 },
  metric: {
    flex: 1,
    minHeight: 70,
    justifyContent: 'center',
    padding: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricValue: { ...typography.display, color: colors.text, fontSize: 22 },
  metricLabel: { ...typography.body, color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  search: {
    ...typography.body,
    minHeight: 46,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  countNote: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginTop: 10 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.surfaceRaised },
  avatarPlaceholder: {
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.bodyBold, color: colors.accent, fontSize: 20 },
  identity: { flex: 1 },
  name: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  school: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 2 },
  meta: {
    ...typography.bodyMedium,
    color: colors.accentLight,
    fontSize: 11,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  arrow: { ...typography.body, color: colors.accent, fontSize: 26 },
  sessionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statValue: { ...typography.bodyBold, color: colors.text, fontSize: 18 },
  statLabel: { ...typography.body, color: colors.textSecondary, fontSize: 10, marginTop: 1 },
  milestoneBadge: {
    marginLeft: 'auto',
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneNumber: { ...typography.bodyBold, color: colors.accent, fontSize: 15 },
  milestoneLabel: { ...typography.bodyBold, color: colors.accent, fontSize: 6, letterSpacing: 1 },
  progressBlock: { marginTop: 12 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  progressFill: { height: 4, backgroundColor: colors.accent },
  progressText: { ...typography.body, color: colors.textSecondary, fontSize: 9, marginTop: 5 },
  century: { ...typography.bodyBold, color: colors.accent, fontSize: 11, marginTop: 12 },
  dates: { ...typography.body, color: colors.textMuted, fontSize: 10, marginTop: 9 },
  loading: { marginTop: 36 },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: 36 },
});
