import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GuildLogo } from '@/components/guild-logo';
import { colors, typography } from '@/lib/theme';

const ROLE_PITCHES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'people-outline',
    title: 'Parents',
    body: 'Book small groups, privates, and partner sessions with current and former NCAA athletes and elite coaches near you.',
  },
  {
    icon: 'flame-outline',
    title: 'Athletes',
    body: 'Train with the best, follow your sessions, and build your shoe collection in the Guild Market.',
  },
  {
    icon: 'school-outline',
    title: 'Coaches',
    body: 'Run your own small groups and privates — set your schedule, message your roster, get paid.',
  },
];

/** Guest-only tab: the front door for creating an account. */
export default function JoinScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <GuildLogo size={96} variant="mark" />
        <Text style={styles.kicker}>JOIN THE GUILD</Text>
        <Text style={styles.heading}>Train with the best.</Text>
        <Text style={styles.sub}>
          Current and former NCAA athletes and elite coaches — personal development that jumps
          levels. Free to join.
        </Text>
      </View>

      {ROLE_PITCHES.map((pitch) => (
        <View key={pitch.title} style={styles.roleCard}>
          <Ionicons name={pitch.icon} size={24} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.roleTitle}>{pitch.title}</Text>
            <Text style={styles.roleBody}>{pitch.body}</Text>
          </View>
        </View>
      ))}

      <Pressable style={styles.primaryButton} onPress={() => router.push('/(auth)/signup')}>
        <Text style={styles.primaryButtonText}>Create your free account</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => router.push('/(auth)/login')}>
        <Text style={styles.secondaryButtonText}>Already a member? Sign in</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  hero: { alignItems: 'center', marginTop: 12, marginBottom: 22 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginTop: 14 },
  heading: { ...typography.display, color: colors.text, fontSize: 32, marginTop: 6 },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  roleCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  roleTitle: { ...typography.bodyBold, color: colors.accent, fontSize: 15 },
  roleBody: { ...typography.body, color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 3 },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 16 },
  secondaryButton: { paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { ...typography.bodySemi, color: colors.accent, fontSize: 14 },
});
