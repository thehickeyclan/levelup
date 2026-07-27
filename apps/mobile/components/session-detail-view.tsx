import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  fetchSessionDetail,
  sessionTypeLabel,
  type RosterParticipant,
  type SessionDetail,
} from '@/lib/parent-data';
import { colors, typography } from '@/lib/theme';

export function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'no-show':
      return 'No-show';
    case 'pending_payment':
      return 'Pending payment';
    default:
      return status ?? '';
  }
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function priceLabel(session: SessionDetail): string | null {
  const per = session.price_per_participant != null ? Number(session.price_per_participant) : null;
  if (per != null && per > 0) return `$${per.toFixed(0)}/athlete`;
  const total = session.total_price != null ? Number(session.total_price) : null;
  if (total != null && total > 0) return `$${total.toFixed(0)}`;
  return null;
}

function rosterMeta(p: RosterParticipant): string {
  const parts: string[] = [];
  if (p.age != null) parts.push(`Age ${p.age}`);
  if (p.weightClass) parts.push(p.weightClass);
  if (p.skillLevel) parts.push(p.skillLevel);
  if (p.graduationYear != null) parts.push(`'${String(p.graduationYear).slice(-2)}`);
  return parts.join(' · ');
}

export function useSessionDetail(sessionId: string | undefined) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [roster, setRoster] = useState<RosterParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    try {
      const res = await fetchSessionDetail(sessionId);
      setSession(res.session);
      setRoster(res.roster);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return { session, roster, loading, error, load };
}

export function SessionDetailView({
  session,
  roster,
  loading,
  error,
  onRefresh,
  footer,
}: {
  session: SessionDetail | null;
  roster: RosterParticipant[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  footer?: React.ReactNode;
}) {
  if (loading && !session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error && !session) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!session) return null;

  const price = priceLabel(session);
  const max = session.max_participants ?? 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <Text style={styles.kicker}>{sessionTypeLabel(session.session_type).toUpperCase()}</Text>
      <Text style={styles.title}>
        {session.focus_area?.trim() ||
          (session.coach
            ? `${session.coach.first_name} ${session.coach.last_name}`
            : 'Session')}
      </Text>
      {session.focus_area_2?.trim() ? (
        <Text style={styles.subFocus}>{session.focus_area_2}</Text>
      ) : null}
      <Text style={styles.when}>{formatWhen(session.scheduled_datetime)}</Text>
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{statusLabel(session.status)}</Text>
        </View>
        {price ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{price}</Text>
          </View>
        ) : null}
        {session.duration_minutes ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{session.duration_minutes} min</Text>
          </View>
        ) : null}
      </View>

      {session.coach ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>COACH</Text>
          <View style={styles.coachRow}>
            {session.coach.photo_url ? (
              <Image
                source={{ uri: session.coach.photo_url }}
                style={styles.avatar}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarLetter}>{session.coach.first_name?.[0] ?? '?'}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.coachName}>
                {session.coach.first_name} {session.coach.last_name}
              </Text>
              {session.coach.school ? <Text style={styles.meta}>{session.coach.school}</Text> : null}
              {session.coach.review_count ? (
                <Text style={styles.meta}>
                  ★ {Number(session.coach.average_rating ?? 0).toFixed(1)} ·{' '}
                  {session.coach.review_count} reviews
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {session.facility ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>LOCATION</Text>
          <Text style={styles.facilityName}>{session.facility.name}</Text>
          {session.facility.address ? (
            <Text style={styles.meta}>{session.facility.address}</Text>
          ) : session.facility.address_hidden ? (
            <Text style={styles.meta}>Exact address shared after booking.</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>
          WHO&apos;S IN{max > 0 ? ` · ${session.filled_count}/${max}` : ''}
        </Text>
        {roster.length === 0 ? (
          <Text style={styles.meta}>No athletes on the roster yet — be the first to join.</Text>
        ) : (
          roster.map((p, i) => {
            const meta = rosterMeta(p);
            return (
              <View
                key={`${p.name}-${i}`}
                style={[styles.rosterRow, i < roster.length - 1 && styles.rosterDivider]}
              >
                <View style={styles.rosterDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rosterName}>{p.name}</Text>
                  {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                </View>
              </View>
            );
          })
        )}
        {session.openings > 0 && session.status === 'scheduled' ? (
          <Text style={styles.spotsLeft}>
            {session.openings} spot{session.openings === 1 ? '' : 's'} left
          </Text>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {footer}
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
    backgroundColor: colors.background,
  },
  kicker: { ...typography.brand, fontSize: 11, color: colors.accent, marginBottom: 8 },
  title: { ...typography.display, fontSize: 28, color: colors.text },
  subFocus: { ...typography.body, fontSize: 15, color: colors.textMuted, marginTop: 4 },
  when: { ...typography.bodyMedium, fontSize: 15, color: colors.text, marginTop: 10 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  badge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.surface,
  },
  badgeText: { ...typography.bodyMedium, fontSize: 12, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 14,
  },
  sectionLabel: {
    ...typography.brand,
    fontSize: 10,
    color: colors.accent,
    marginBottom: 10,
  },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.black,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { ...typography.bodyBold, fontSize: 17, color: colors.accent },
  coachName: { ...typography.bodySemi, fontSize: 16, color: colors.text },
  facilityName: { ...typography.bodySemi, fontSize: 15, color: colors.text },
  meta: { ...typography.body, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rosterDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rosterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  rosterName: { ...typography.bodyMedium, fontSize: 15, color: colors.text },
  spotsLeft: { ...typography.bodyBold, fontSize: 13, color: colors.accent, marginTop: 12 },
  error: { ...typography.body, color: colors.danger, marginTop: 12 },
});
