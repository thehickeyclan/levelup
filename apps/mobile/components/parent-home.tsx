import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import { apiFetch } from '@/lib/api';
import {
  fetchFamilyBookings,
  fetchOpenSmallGroupSessions,
  type MobileBooking,
  type OpenSmallGroupSession,
} from '@/lib/parent-data';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';
import { ParentReviewPromptModal, type ParentReviewPrompt } from '@/components/parent-review-prompt';
import { mobileActivityTitle, type MobileActivityPost } from '@/lib/activity-display';
import { milestoneFor } from '@/lib/coach-athletes';

type CoachMapPin = {
  pinKey: string;
  coachId: string;
  firstName: string;
  lastName: string;
  facilityName: string;
  latitude: number;
  longitude: number;
  hasOpenSession: boolean;
};

type ActivityPreview = MobileActivityPost & {
  id: string;
};

const NC_REGION = {
  latitude: 35.5,
  longitude: -79.4,
  latitudeDelta: 4.4,
  longitudeDelta: 5.6,
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ParentHomeScreen() {
  const router = useRouter();
  const { user, role, previewAthleteView } = useAuth();
  const isAthlete = role === 'youth_wrestler' || previewAthleteView;
  const [sessions, setSessions] = useState<OpenSmallGroupSession[]>([]);
  const [bookings, setBookings] = useState<MobileBooking[]>([]);
  const [pins, setPins] = useState<CoachMapPin[]>([]);
  const [activity, setActivity] = useState<ActivityPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewPrompts, setReviewPrompts] = useState<ParentReviewPrompt[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sessionRows, bookingRows, map, feed, reviews] = await Promise.all([
        fetchOpenSmallGroupSessions(),
        user ? fetchFamilyBookings(user.id) : Promise.resolve([]),
        apiFetch<{ pins: CoachMapPin[] }>('/api/map/coach-pins').catch(() => ({ pins: [] })),
        apiFetch<{ posts: ActivityPreview[] }>('/api/activity/feed?scope=community&limit=3').catch(() => ({
          posts: [],
        })),
        role === 'parent'
          ? apiFetch<{ prompts: ParentReviewPrompt[] }>('/api/mobile/reviews/pending').catch(() => ({
              prompts: [],
            }))
          : Promise.resolve({ prompts: [] }),
      ]);
      setSessions(sessionRows);
      setBookings(bookingRows);
      setPins(map.pins ?? []);
      setActivity(feed.posts ?? []);
      setReviewPrompts(reviews.prompts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Home');
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const nextBooking = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            !['completed', 'cancelled', 'no-show'].includes(booking.status) &&
            new Date(booking.scheduled_datetime).getTime() >= Date.now()
        )
        .sort(
          (a, b) =>
            new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
        )[0] ?? null,
    [bookings]
  );
  const completedTrainingCount = useMemo(
    () => bookings.filter((booking) => booking.status === 'completed').length,
    [bookings]
  );
  const milestone = milestoneFor(completedTrainingCount);

  return (
    <>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>THE WRESTLING GUILD</Text>
      <Text style={styles.heading}>
        {isAthlete ? 'Build your wrestling week.' : 'Your next level starts here.'}
      </Text>
      <Text style={styles.sub}>
        {isAthlete
          ? 'Find open small groups, follow coaches, and keep track of your Guild training journey.'
          : 'Train with NCAA wrestlers and elite coaches in your community. Join an open session or choose a coach and book directly from their availability.'}
      </Text>

      <View style={styles.actions}>
        <Pressable style={styles.primaryAction} onPress={() => router.push('/(tabs)/find?tab=available')}>
          <Text style={styles.primaryActionTitle}>Available training</Text>
          <Text style={styles.primaryActionMeta}>{sessions.length} sessions with open spots</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={() => router.push('/(tabs)/find?tab=request')}>
          <Text style={styles.secondaryActionTitle}>Book a coach</Text>
          <Text style={styles.secondaryActionMeta}>Private · Partner · Small group</Text>
        </Pressable>
      </View>

      {isAthlete ? (
        <View style={styles.journeyCard}>
          <Text style={styles.sectionKicker}>MY GUILD JOURNEY</Text>
          <View style={styles.journeyTop}>
            <View>
              <Text style={styles.journeyNumber}>{completedTrainingCount}</Text>
              <Text style={styles.journeyLabel}>completed sessions</Text>
            </View>
            <View style={styles.milestonePill}>
              <Text style={styles.milestonePillNumber}>
                {milestone.earned ? `${milestone.earned}` : milestone.next ? `${milestone.next}` : '100+'}
              </Text>
              <Text style={styles.milestonePillLabel}>
                {milestone.earned ? 'CLUB' : 'NEXT'}
              </Text>
            </View>
          </View>
          {milestone.next ? (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${milestone.progress * 100}%` }]} />
              </View>
              <Text style={styles.journeyMeta}>
                {Math.max(0, milestone.next - completedTrainingCount)} more to reach the {milestone.next}-Session Club.
              </Text>
            </>
          ) : (
            <Text style={styles.journeyMeta}>You’re in the 100-Session Club. Keep stacking work.</Text>
          )}
        </View>
      ) : null}

      {nextBooking ? (
        <Pressable style={styles.nextCard} onPress={() => router.push(`/booking/${nextBooking.id}`)}>
          <Text style={styles.sectionKicker}>YOUR NEXT TRAINING</Text>
          <Text style={styles.cardTitle}>
            {nextBooking.coach
              ? `${nextBooking.coach.first_name} ${nextBooking.coach.last_name}`
              : 'Upcoming training'}
          </Text>
          <Text style={styles.cardMeta}>{formatWhen(nextBooking.scheduled_datetime)}</Text>
          {nextBooking.facility?.name ? <Text style={styles.cardMeta}>{nextBooking.facility.name}</Text> : null}
        </Pressable>
      ) : null}

      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={styles.sectionKicker}>COACH LOCATIONS</Text>
          <Text style={styles.sectionTitle}>Elite coaching, close to home.</Text>
        </View>
      </View>
      <Text style={styles.sectionIntro}>
        Explore Guild coaches by location, then view their profile, availability, and training
        options.
      </Text>
      <Pressable style={styles.mapWrap} onPress={() => router.push('/coach-map')}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={NC_REGION}
          userInterfaceStyle="dark"
          pointerEvents="none"
        >
          {pins.map((pin) => (
            <Marker
              key={pin.pinKey}
              coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
              pinColor={pin.hasOpenSession ? '#22C55E' : '#B89D60'}
            />
          ))}
        </MapView>
        <View style={styles.mapCaption}>
          <Text style={styles.mapCaptionText}>
            {pins.length > 0
              ? `${pins.length} coach ${pins.length === 1 ? 'location' : 'locations'} · Explore the map →`
              : 'Explore coach locations →'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionKicker}>AVAILABLE NOW</Text>
          <Text style={styles.sectionTitle}>Upcoming training</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/find?tab=available')}>
          <Text style={styles.link}>See all →</Text>
        </Pressable>
      </View>
      {sessions.slice(0, 3).map((session) => {
        const open = Math.max(0, (session.max_participants ?? 0) - (session.current_participants ?? 0));
        return (
          <Pressable key={session.id} style={styles.sessionRow} onPress={() => router.push(`/session/${session.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {session.coach
                  ? `${session.coach.first_name} ${session.coach.last_name}`
                  : 'Small-group training'}
              </Text>
              <Text style={styles.cardMeta}>{formatWhen(session.scheduled_datetime)}</Text>
              {session.facility?.name ? <Text style={styles.cardMeta}>{session.facility.name}</Text> : null}
            </View>
            <Text style={styles.openText}>{open} open</Text>
          </Pressable>
        );
      })}

      {activity.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionKicker}>{isAthlete ? 'TRAINING FEED' : 'AROUND THE GUILD'}</Text>
              <Text style={styles.sectionTitle}>Recent activity</Text>
            </View>
          </View>
          {activity.map((post) => {
            const title = mobileActivityTitle(post);
            return (
              <View key={post.id} style={styles.activityRow}>
                <View style={styles.activityDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{title}</Text>
                  {post.caption && post.caption !== title ? (
                    <Text style={styles.cardMeta}>{post.caption}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </>
      ) : null}

      {loading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 18 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
    <ParentReviewPromptModal
      prompt={reviewPrompts[0] ?? null}
      onDone={() => setReviewPrompts((current) => current.slice(1))}
    />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 31, lineHeight: 36 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  actions: { gap: 10, marginTop: 20 },
  primaryAction: { backgroundColor: colors.accent, borderRadius: 6, padding: 17 },
  primaryActionTitle: { ...typography.bodyBold, color: colors.black, fontSize: 17 },
  primaryActionMeta: { ...typography.bodyMedium, color: 'rgba(0,0,0,0.65)', fontSize: 12, marginTop: 3 },
  secondaryAction: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 6, padding: 17 },
  secondaryActionTitle: { ...typography.bodyBold, color: colors.text, fontSize: 17 },
  secondaryActionMeta: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 3 },
  journeyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    padding: 16,
    marginTop: 18,
  },
  journeyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  journeyNumber: { ...typography.display, color: colors.text, fontSize: 35, lineHeight: 38 },
  journeyLabel: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 2 },
  milestonePill: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
  milestonePillNumber: { ...typography.bodyBold, color: colors.accent, fontSize: 20 },
  milestonePillLabel: { ...typography.bodyBold, color: colors.accent, fontSize: 8, letterSpacing: 1.4 },
  progressTrack: {
    height: 7,
    borderRadius: 99,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    marginTop: 14,
  },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: colors.accent },
  journeyMeta: { ...typography.body, color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 9 },
  nextCard: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1, borderRadius: 6, padding: 16, marginTop: 22 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 28, marginBottom: 8 },
  sectionHeaderCopy: { flex: 1, minWidth: 0 },
  sectionKicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 5 },
  sectionTitle: { ...typography.display, color: colors.text, fontSize: 24, lineHeight: 29 },
  sectionIntro: { ...typography.body, color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  link: { ...typography.bodyBold, color: colors.accent, fontSize: 12, paddingVertical: 6 },
  mapWrap: { height: 220, overflow: 'hidden', borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  mapCaption: { position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.78)', padding: 9, borderRadius: 4 },
  mapCaptionText: { ...typography.bodySemi, color: colors.text, fontSize: 12, textAlign: 'center' },
  sessionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderBottomColor: colors.border, borderBottomWidth: 1 },
  cardTitle: { ...typography.bodySemi, color: colors.text, fontSize: 16 },
  cardMeta: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 3 },
  openText: { ...typography.bodyBold, color: colors.success, fontSize: 12, flexShrink: 0 },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomColor: colors.border, borderBottomWidth: 1 },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 6 },
  error: { ...typography.body, color: colors.danger, fontSize: 13, marginTop: 16 },
});
