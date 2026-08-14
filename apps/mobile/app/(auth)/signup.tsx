import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { GuildLogo } from '@/components/guild-logo';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';

type SignupRole = 'parent' | 'youth_wrestler' | 'coach';

const ROLE_OPTIONS: { value: SignupRole; label: string; hint: string }[] = [
  { value: 'parent', label: 'Parent', hint: 'Book training and shop for your wrestler' },
  { value: 'youth_wrestler', label: 'Athlete', hint: 'Wrestlers with their own account' },
  { value: 'coach', label: 'Coach', hint: 'College athletes and club coaches — apply to coach' },
];

export default function SignupScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [role, setRole] = useState<SignupRole>('parent');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  // Coach application extras
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [coachType, setCoachType] = useState<'ncaa_athlete' | 'club_hs_coach'>('ncaa_athlete');
  const [school, setSchool] = useState('');
  const [bio, setBio] = useState('');
  const [venmoHandle, setVenmoHandle] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCoach = role === 'coach';

  async function onSubmit() {
    if (submitting) return;
    setError(null);
    if (!firstName.trim() || !lastName.trim()) return setError('Enter your first and last name.');
    if (!email.trim()) return setError('Enter your email.');
    if (!phone.trim()) return setError('Enter your cell phone.');
    if (!isCoach && !/^\d{5}(-\d{4})?$/.test(zipCode.trim())) {
      return setError('Enter a valid 5-digit home ZIP code.');
    }
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (role === 'youth_wrestler' && !ageConfirmed) {
      return setError('Athlete accounts are for wrestlers 13 and older — younger wrestlers are managed from a parent account.');
    }
    if (isCoach) {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateOfBirth.trim())) {
        return setError('Enter your date of birth as MM/DD/YYYY.');
      }
      if (!school.trim()) return setError('Enter your school or club.');
      if (!bio.trim()) return setError('Add a short coaching bio.');
      if (!venmoHandle.trim()) return setError('Enter your Venmo handle for session payouts.');
    }

    setSubmitting(true);
    try {
      if (isCoach) {
        await apiFetch('/api/auth/coach-application', {
          method: 'POST',
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            dateOfBirth: dateOfBirth.trim(),
            coachType,
            school: school.trim(),
            bio: bio.trim(),
            venmoHandle: venmoHandle.trim(),
            password,
          }),
        });
      } else {
        await apiFetch('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            role,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            zipCode: zipCode.trim(),
            password,
            ...(role === 'parent' && referralCode.trim()
              ? { referralCode: referralCode.trim() }
              : {}),
          }),
        });
      }

      await signIn(email.trim().toLowerCase(), password);

      if (role === 'parent') {
        Alert.alert('Welcome to the Guild!', 'Add your wrestler so coaches know who is training.', [
          { text: 'Add my wrestler', onPress: () => router.replace('/my-wrestlers') },
          { text: 'Later', onPress: () => router.replace('/(tabs)') },
        ]);
      } else if (role === 'youth_wrestler') {
        router.replace('/(tabs)');
      } else {
        Alert.alert(
          'Application received',
          'Welcome to the Guild. You can browse now — full coach tools unlock as soon as an admin approves your application.',
          [{ text: 'Let’s go', onPress: () => router.replace('/(tabs)') }]
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <GuildLogo size={84} variant="mark" />
          <Text style={styles.kicker}>JOIN THE GUILD</Text>
          <Text style={styles.heading}>Create your account</Text>
        </View>

        <Text style={styles.label}>I AM A…</Text>
        <View style={styles.roleRow}>
          {ROLE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.roleChip, role === option.value && styles.roleChipActive]}
              onPress={() => setRole(option.value)}
            >
              <Text style={[styles.roleChipText, role === option.value && styles.roleChipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.roleHint}>{ROLE_OPTIONS.find((o) => o.value === role)?.hint}</Text>

        <View style={styles.nameRow}>
          <Input flex label="FIRST NAME" value={firstName} onChangeText={setFirstName} placeholder="Jordan" />
          <Input flex label="LAST NAME" value={lastName} onChangeText={setLastName} placeholder="Smith" />
        </View>
        <Input label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@email.com" keyboardType="email-address" autoCapitalize="none" />
        <Input label="CELL PHONE" value={phone} onChangeText={setPhone} placeholder="(919) 555-1234" keyboardType="phone-pad" />
        {!isCoach ? (
          <Input label="HOME ZIP CODE" value={zipCode} onChangeText={setZipCode} placeholder="27601" keyboardType="number-pad" />
        ) : null}
        {role === 'parent' ? (
          <Input
            label="REFERRAL CODE (OPTIONAL)"
            value={referralCode}
            onChangeText={setReferralCode}
            placeholder="From a friend's invite link"
            autoCapitalize="none"
          />
        ) : null}

        {isCoach ? (
          <>
            <Input label="DATE OF BIRTH" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
            <Text style={styles.label}>COACH TYPE</Text>
            <View style={styles.roleRow}>
              <Pressable
                style={[styles.roleChip, coachType === 'ncaa_athlete' && styles.roleChipActive]}
                onPress={() => setCoachType('ncaa_athlete')}
              >
                <Text style={[styles.roleChipText, coachType === 'ncaa_athlete' && styles.roleChipTextActive]}>College athlete</Text>
              </Pressable>
              <Pressable
                style={[styles.roleChip, coachType === 'club_hs_coach' && styles.roleChipActive]}
                onPress={() => setCoachType('club_hs_coach')}
              >
                <Text style={[styles.roleChipText, coachType === 'club_hs_coach' && styles.roleChipTextActive]}>Club / HS coach</Text>
              </Pressable>
            </View>
            <Input label="SCHOOL / CLUB" value={school} onChangeText={setSchool} placeholder="NC State" />
            <Input label="COACHING BIO" value={bio} onChangeText={setBio} placeholder="Credentials, style, what families should know" multiline />
            <Input label="VENMO HANDLE (SESSION PAYOUTS)" value={venmoHandle} onChangeText={setVenmoHandle} placeholder="@your-venmo" autoCapitalize="none" />
          </>
        ) : null}

        <Input label="PASSWORD" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />

        {role === 'youth_wrestler' ? (
          <Pressable style={styles.attestRow} onPress={() => setAgeConfirmed((v) => !v)}>
            <View style={[styles.attestDot, ageConfirmed && styles.attestDotOn]} />
            <Text style={styles.attestText}>
              I am 13 or older. Younger wrestlers are added and managed from a parent account.
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.termsText}>
          By creating an account you agree to the Guild{' '}
          <Text style={styles.termsLink} onPress={() => void WebBrowser.openBrowserAsync('https://www.wrestlingguild.com/terms')}>Terms</Text>
          {' '}and{' '}
          <Text style={styles.termsLink} onPress={() => void WebBrowser.openBrowserAsync('https://www.wrestlingguild.com/privacy')}>Privacy Policy</Text>.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={() => void onSubmit()} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <Text style={styles.buttonText}>{isCoach ? 'Apply to coach' : 'Create account'}</Text>
          )}
        </Pressable>

        <Pressable style={styles.signinRow} onPress={() => router.back()}>
          <Text style={styles.signinText}>
            Already in the Guild? <Text style={styles.signinLink}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Input({
  label,
  flex,
  multiline,
  ...props
}: { label: string; flex?: boolean; multiline?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={[styles.inputWrap, flex && { flex: 1 }]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  attestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface },
  attestDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  attestDotOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  attestText: { ...typography.body, color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 17 },
  termsText: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 16, textAlign: 'center', lineHeight: 17 },
  termsLink: { ...typography.bodySemi, color: colors.accent },
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 48 },
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 20 },
  kicker: { ...typography.brand, fontSize: 11, color: colors.accent, marginTop: 12 },
  heading: { ...typography.display, fontSize: 28, color: colors.text, marginTop: 6 },
  label: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 10, letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  roleChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  roleChipText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 12 },
  roleChipTextActive: { color: colors.black },
  roleHint: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 8 },
  nameRow: { flexDirection: 'row', gap: 10 },
  inputWrap: {},
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, ...typography.body, fontSize: 15 },
  inputMultiline: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  error: { ...typography.body, color: colors.danger, fontSize: 13, marginTop: 14 },
  button: { marginTop: 20, backgroundColor: colors.accent, borderRadius: 8, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { ...typography.bodyBold, color: colors.black, fontSize: 15, letterSpacing: 0.4 },
  signinRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  signinText: { ...typography.body, color: colors.textMuted, fontSize: 14 },
  signinLink: { ...typography.bodyBold, color: colors.accent },
});
