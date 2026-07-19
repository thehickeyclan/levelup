import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CoachHomeScreen } from '@/components/coach-home';
import { GuildLogo } from '@/components/guild-logo';
import { ReviewPromptCard, usePendingReviews } from '@/components/review-prompts';
import { useAuth } from '@/lib/auth';
import { useNotificationRealtime } from '@/lib/use-notification-realtime';
import { colors, typography } from '@/lib/theme';

export default function HomeScreen() {
  const { user, isCoachView } = useAuth();
  const { unreadCount } = useNotificationRealtime();
  const { prompts, refresh } = usePendingReviews();
  const router = useRouter();

  if (isCoachView) return <CoachHomeScreen />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <GuildLogo size={140} />
      <Text style={styles.brand}>THE GUILD</Text>
      <Text style={styles.title}>Train with{'\n'}elite coaches.</Text>
      <Text style={styles.body}>
        Join an open session, train with experienced coaches, and stay connected with your team.
      </Text>

      <Pressable style={styles.primaryCta} onPress={() => router.push('/(tabs)/find')}>
        <Text style={styles.primaryCtaText}>Join a small group</Text>
      </Pressable>
      <Pressable
        style={styles.secondaryCta}
        onPress={() => router.push({ pathname: '/(tabs)/find', params: { tab: 'coaches' } })}
      >
        <Text style={styles.secondaryCtaText}>Book a private</Text>
      </Pressable>

      {prompts.map((p) => (
        <ReviewPromptCard key={p.sessionId} prompt={p} onDone={() => void refresh()} />
      ))}

      <View style={styles.linkStack}>
        <Pressable style={styles.linkRow} onPress={() => router.push('/notifications')}>
          <Text style={styles.linkTitle}>
            Alerts{unreadCount > 0 ? ` · ${unreadCount}` : ''}
          </Text>
          <Text style={styles.linkMeta}>Session updates</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push('/(tabs)/bookings')}>
          <Text style={styles.linkTitle}>My bookings</Text>
          <Text style={styles.linkMeta}>Groups & privates</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push('/(tabs)/market')}>
          <Text style={styles.linkTitle}>Guild Market</Text>
          <Text style={styles.linkMeta}>Shoes & gear</Text>
        </Pressable>
      </View>

      <Text style={styles.meta}>{user?.email}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, paddingBottom: 48, alignItems: 'stretch' },
  brand: {
    ...typography.brand,
    fontSize: 13,
    color: colors.accent,
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  title: {
    ...typography.display,
    fontSize: 36,
    lineHeight: 42,
    color: colors.text,
    marginBottom: 12,
  },
  body: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
    marginBottom: 28,
    maxWidth: 320,
  },
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
    marginBottom: 28,
  },
  secondaryCtaText: {
    ...typography.bodyBold,
    fontSize: 15,
    color: colors.accent,
    letterSpacing: 0.4,
  },
  linkStack: { gap: 0, borderTopWidth: 1, borderTopColor: colors.border },
  linkRow: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkTitle: {
    ...typography.bodySemi,
    fontSize: 16,
    color: colors.text,
  },
  linkMeta: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  meta: {
    ...typography.body,
    marginTop: 28,
    color: colors.textSecondary,
    fontSize: 12,
  },
});
