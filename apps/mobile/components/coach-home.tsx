import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { GuildLogo } from '@/components/guild-logo';
import { useAuth } from '@/lib/auth';
import { coachSessionTitle, fetchCoachUpcomingSessions, type CoachSessionRow } from '@/lib/coach-data';
import { sessionTypeLabel } from '@/lib/parent-data';
import { useNotificationRealtime } from '@/lib/use-notification-realtime';
import { colors, typography } from '@/lib/theme';
import { apiFetch } from '@/lib/api';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CoachHomeScreen() {
  const { user, role, previewCoachView, selectedCoachId, selectedCoachName } = useAuth();
  const { unreadCount } = useNotificationRealtime();
  const router = useRouter();
  const [sessions, setSessions] = useState<CoachSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weeklyWindowCount, setWeeklyWindowCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const coachId = role === 'admin' ? selectedCoachId : user.id;
    if (!coachId) {
      setSessions([]);
      setWeeklyWindowCount(null);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [list, availability] = await Promise.all([
        fetchCoachUpcomingSessions(coachId),
        apiFetch<{ windows?: unknown[] }>('/api/coach/availability/weekly').catch(() => ({ windows: [] })),
      ]);
      setSessions(list);
      setWeeklyWindowCount(availability.windows?.length ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load schedule');
    } finally {
      setLoading(false);
    }
  }, [role, selectedCoachId, user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const isPreviewOnly = previewCoachView && role !== 'coach' && role !== 'admin';
  const coachSummary = useMemo(() => {
    const booked = sessions.reduce((sum, session) => sum + (session.current_participants ?? 0), 0);
    const openSpots = sessions.reduce(
      (sum, session) =>
        sum + Math.max(0, (session.max_participants ?? 0) - (session.current_participants ?? 0)),
      0
    );
    return { booked, openSpots };
  }, [sessions]);

  return (
    <FlatList
      style={styles.screen}
      data={sessions}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load()}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <GuildLogo size={120} />
          <Text style={styles.brand}>THE GUILD</Text>
          <Text style={styles.title}>Grow your training business.</Text>
          <Text style={styles.body}>
            Publish availability, fill private and small-group sessions, and manage every athlete in one place.
          </Text>
          {role === 'admin' ? (
            <Pressable style={styles.adminCoach} onPress={() => router.push('/select-coach')}>
              <Text style={styles.adminCoachLabel}>PREVIEWING COACH</Text>
              <Text style={styles.adminCoachName}>{selectedCoachName ?? 'Choose a coach'}</Text>
            </Pressable>
          ) : null}
          {isPreviewOnly ? (
            <Text style={styles.previewNote}>
              Preview mode — you&apos;re signed in as a parent. Toggle this off in Account. Sign in
              with a coach account to see a real schedule.
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primaryCta, role === 'admin' && !selectedCoachId && styles.disabledCta]}
            onPress={() => router.push('/create-session')}
            disabled={role === 'admin' && !selectedCoachId}
          >
            <Text style={styles.primaryCtaText}>Create a session</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryCta, role === 'admin' && !selectedCoachId && styles.disabledCta]}
            onPress={() => weeklyWindowCount === 0 ? router.push('/coach-availability-setup') : router.push('/coach-availability-custom')}
            disabled={role === 'admin' && !selectedCoachId}
          >
            <Text style={styles.secondaryCtaText}>{weeklyWindowCount === 0 ? 'Set your normal week' : 'Manage calendar'}</Text>
          </Pressable>
          {role === 'admin' && !selectedCoachId ? (
            <Pressable style={styles.calendarWarning} onPress={() => router.push('/select-coach')}>
              <Text style={styles.calendarWarningTitle}>Choose a coach to continue</Text>
              <Text style={styles.calendarWarningText}>Admin preview needs a coach before showing or changing coach data.</Text>
            </Pressable>
          ) : weeklyWindowCount === 0 ? (
            <Pressable style={styles.calendarWarning} onPress={() => router.push('/coach-availability-setup')}>
              <Text style={styles.calendarWarningTitle}>Parents can’t book you yet</Text>
              <Text style={styles.calendarWarningText}>Choose your usual weekly hours once. We’ll repeat them automatically.</Text>
            </Pressable>
          ) : (
            <Text style={styles.calendarHealthy}>Calendar active · {weeklyWindowCount} weekly window{weeklyWindowCount === 1 ? '' : 's'}</Text>
          )}

          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{sessions.length}</Text>
              <Text style={styles.metricLabel}>Upcoming</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{coachSummary.booked}</Text>
              <Text style={styles.metricLabel}>Athletes</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{coachSummary.openSpots}</Text>
              <Text style={styles.metricLabel}>Open spots</Text>
            </View>
          </View>

          <View style={styles.quickLinks}>
            <Pressable style={styles.quickLink} onPress={() => router.push('/coach-athletes')}>
              <Text style={styles.linkTitle}>My Athletes</Text>
              <Text style={styles.linkMeta}>History & milestones</Text>
            </Pressable>
            <Pressable style={styles.quickLink} onPress={() => router.push('/coach-directory')}>
              <Text style={styles.linkTitle}>Coach Directory</Text>
              <Text style={styles.linkMeta}>Connect & refer</Text>
            </Pressable>
          </View>
          <View style={styles.quickLinks}>
            <Pressable style={styles.quickLink} onPress={() => router.push('/(tabs)/inbox')}>
              <Text style={styles.linkTitle}>Messages</Text>
              <Text style={styles.linkMeta}>Guild conversations</Text>
            </Pressable>
            <Pressable style={styles.quickLink} onPress={() => router.push('/coach-playbook')}>
              <Text style={styles.linkTitle}>Coach Playbook</Text>
              <Text style={styles.linkMeta}>Tips from coaches</Text>
            </Pressable>
          </View>
          <Pressable style={styles.alertLink} onPress={() => router.push('/notifications')}>
            <Text style={styles.linkTitle}>Alerts{unreadCount > 0 ? ` · ${unreadCount}` : ''}</Text>
            <Text style={styles.linkMeta}>Bookings & updates</Text>
          </Pressable>

          <Pressable style={styles.dashboardLink} onPress={() => router.push('/coach-earnings')}>
            <Text style={styles.dashboardLinkText}>Open earnings ›</Text>
          </Pressable>

          <Text style={styles.section}>Upcoming sessions</Text>
          {loading && sessions.length === 0 ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.card}
          onPress={() => router.push(`/session/${item.id}`)}
        >
          <Text style={styles.typeLabel}>{sessionTypeLabel(item.session_type)}</Text>
          <Text style={styles.cardTitle}>{coachSessionTitle(item)}</Text>
          <Text style={styles.cardMeta}>{formatWhen(item.scheduled_datetime)}</Text>
          {item.facilities?.name ? (
            <Text style={styles.cardMeta}>{item.facilities.name}</Text>
          ) : null}
          {item.max_participants != null ? (
            <Text style={styles.cardMeta}>
              {item.current_participants ?? 0}/{item.max_participants} athletes
            </Text>
          ) : null}
        </Pressable>
      )}
      ListEmptyComponent={
        !loading ? (
          <Text style={styles.empty}>
            No upcoming sessions. Create a small group to fill your calendar.
          </Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, paddingBottom: 48 },
  header: { marginBottom: 8 },
  brand: {
    ...typography.brand,
    fontSize: 13,
    color: colors.accent,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  title: {
    ...typography.display,
    fontSize: 32,
    lineHeight: 38,
    color: colors.text,
    marginBottom: 10,
  },
  body: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    marginBottom: 16,
  },
  previewNote: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentLight,
    marginBottom: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  adminCoach: {
    minHeight: 62,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 13,
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: colors.surface,
  },
  adminCoachLabel: { ...typography.brand, color: colors.accent, fontSize: 9 },
  adminCoachName: { ...typography.bodySemi, color: colors.text, fontSize: 15, marginTop: 4 },
  disabledCta: { opacity: 0.4 },
  error: { color: colors.danger, marginBottom: 12, fontFamily: 'Inter_400Regular' },
  primaryCta: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  primaryCtaText: {
    ...typography.bodyBold,
    fontSize: 15,
    color: colors.black,
    letterSpacing: 0.4,
  },
  secondaryCta: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  secondaryCtaText: {
    ...typography.bodyBold,
    fontSize: 15,
    color: colors.accent,
    letterSpacing: 0.4,
  },
  calendarWarning: { borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface, padding: 13, marginBottom: 16, borderRadius: 4 },
  calendarWarningTitle: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  calendarWarningText: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  calendarHealthy: { ...typography.bodyMedium, color: colors.success, fontSize: 12, marginBottom: 16 },
  metrics: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metric: {
    flex: 1,
    minHeight: 76,
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  metricValue: { ...typography.display, color: colors.text, fontSize: 24 },
  metricLabel: { ...typography.body, color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  quickLinks: { flexDirection: 'row', gap: 8 },
  quickLink: {
    flex: 1,
    minHeight: 68,
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alertLink: {
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dashboardLink: { minHeight: 48, justifyContent: 'center', marginBottom: 12 },
  dashboardLinkText: { ...typography.bodySemi, color: colors.accent, fontSize: 14 },
  linkTitle: { ...typography.bodySemi, fontSize: 16, color: colors.text },
  linkMeta: { ...typography.body, fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  section: {
    ...typography.brand,
    fontSize: 11,
    color: colors.accent,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  typeLabel: { ...typography.brand, fontSize: 10, color: colors.accent, marginBottom: 6 },
  cardTitle: { ...typography.bodySemi, fontSize: 16, color: colors.text },
  cardMeta: { ...typography.body, color: colors.textSecondary, marginTop: 4, fontSize: 13 },
  empty: { ...typography.body, color: colors.textMuted, marginTop: 4 },
});
