import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { GuildLogo } from '@/components/guild-logo';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';

export default function LoginScreen() {
  const { session, signIn, loading: authLoading } = useAuth();
  const router = useRouter();
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
      <View style={styles.hero}>
        <GuildLogo size={180} />
        <Text style={styles.brand}>THE GUILD</Text>
        <Text style={styles.headline}>Join small groups.{'\n'}Train with elite coaches.</Text>
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
        <Pressable style={styles.signupRow} onPress={() => router.push('/(auth)/signup')}>
          <Text style={styles.signupText}>
            New to the Guild? <Text style={styles.signupLink}>Create your account</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  signupRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  signupText: { ...typography.body, color: colors.textMuted, fontSize: 14 },
  signupLink: { ...typography.bodyBold, color: colors.accent },
  root: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' },
  hero: { marginBottom: 36, alignItems: 'center' },
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
