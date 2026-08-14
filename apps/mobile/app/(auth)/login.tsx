import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { GuildLogo } from '@/components/guild-logo';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';

export default function LoginScreen() {
  const { session, signIn, loading: authLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && session) {
    return <Redirect href="/(tabs)" />;
  }

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.hero}>
        <GuildLogo size={110} />
        <Text style={styles.brand}>THE GUILD</Text>
        <Text style={styles.headline}>Train with the best.</Text>
        <Text style={styles.tagline}>NCAA athletes & elite coaches</Text>
        <Text style={styles.taglineMeta}>SMALL GROUPS · PRIVATES · PARTNER SESSIONS</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="you@email.com"
          placeholderTextColor={colors.textSecondary}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.textSecondary}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={() => void onSubmit()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>
        <Pressable style={styles.signupButton} onPress={() => router.push('/(auth)/signup')}>
          <Text style={styles.signupButtonText}>Create your free account</Text>
        </Pressable>
        <Pressable style={styles.guestRow} onPress={() => router.replace('/(tabs)/find')}>
          <Text style={styles.guestText}>Browse coaches and the Market without an account →</Text>
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  guestRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  guestText: { ...typography.bodyMedium, color: colors.textMuted, fontSize: 13 },
  tagline: {
    ...typography.bodySemi,
    color: colors.text,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 14,
  },
  taglineMeta: {
    ...typography.bodyMedium,
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 1.4,
    textAlign: 'center',
    marginTop: 6,
  },
  signupButton: {
    marginTop: 12,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupButtonText: { ...typography.bodyBold, color: colors.accent, fontSize: 15, letterSpacing: 0.4 },
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  hero: { marginBottom: 28, alignItems: 'center' },
  brand: {
    ...typography.brand,
    fontSize: 14,
    color: colors.accent,
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  headline: {
    ...typography.display,
    fontSize: 28,
    lineHeight: 36,
    color: colors.text,
    textAlign: 'center',
  },
  form: { gap: 8 },
  label: {
    ...typography.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    fontFamily: 'Inter_400Regular',
  },
  error: { color: colors.danger, marginTop: 8, fontFamily: 'Inter_400Regular' },
  button: {
    marginTop: 20,
    backgroundColor: colors.accent,
    borderRadius: 4,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 15,
    letterSpacing: 0.4,
  },
});
