import { useCallback, useState } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import { GuildLogo } from '@/components/guild-logo';
import { useAuth } from '@/lib/auth';
import { coachSessionTitle, fetchCoachUpcomingSessions, type CoachSessionRow } from '@/lib/coach-data';
import { sessionTypeLabel } from '@/lib/parent-data';
import { WEB_ORIGIN } from '@/lib/config';
import { useNotificationRealtime } from '@/lib/use-notification-realtime';
import { colors, typography } from '@/lib/theme';

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
  const { user, role, previewCoachView } = useAuth();
  const { unreadCount } = useNotificationRealtime();
  const router = useRouter();
  const [sessions, setSessions] = useState<CoachSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const list = await fetchCoachUpcomingSessions(user.id);
      setSessions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load schedule');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const isPreviewOnly = previewCoachView && role !== 'coach' && role !== 'admin';

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
          <Text style={styles.title}>Coach home</Text>
          <Text style={styles.body}>
            Your schedule, alerts, and messages — open Guild before every session.
          </Text>
          {isPreviewOnly ? (
            <Text style={styles.previewNote}>
              Preview mode — you&apos;re signed in as a parent. Toggle this off in Account. Sign in
              with a coach account to see a real schedule.
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={styles.primaryCta}
            onPress={() => void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/athlete-dashboard`)}
          >
            <Text style={styles.primaryCtaText}>Open full coach dashboard</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryCta}
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/coach-sessions/create?type=small_group`)
            }
          >
            <Text style={styles.secondaryCtaText}>Create small group</Text>
          </Pressable>

          <Pressable style={styles.linkRow} onPress={() => router.push('/notifications')}>
            <Text style={styles.linkTitle}>
              Alerts{unreadCount > 0 ? ` · ${unreadCount}` : ''}
            </Text>
            <Text style={styles.linkMeta}>Bookings & messages</Text>
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
          onPress={() =>
            void WebBrowser.openBrowserAsync(`${WEB_ORIGIN}/athlete-dashboard?tab=upcoming`)
          }
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
  linkRow: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
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
