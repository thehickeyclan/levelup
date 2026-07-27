import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';

type CoachProfile = {
  id: string;
  first_name?: string;
  last_name?: string;
  school?: string;
  weight_class?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  phone?: string | null;
  zip_code?: string | null;
  facility_id?: string | null;
  secondary_facility_id?: string | null;
  credentials?: Record<string, unknown> | null;
  active?: boolean;
  venmo_handle?: string | null;
  zelle_email?: string | null;
};

export default function CoachProfileEditScreen() {
  const router = useRouter();
  const { selectedCoachName } = useAuth();
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [bio, setBio] = useState('');
  const [weight, setWeight] = useState('');
  const [phone, setPhone] = useState('');
  const [zip, setZip] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<{ athlete: CoachProfile | null; error?: string }>('/api/athletes/profile');
      if (!result.athlete) throw new Error(result.error || 'Coach profile not found');
      setProfile(result.athlete);
      setBio(result.athlete.bio ?? '');
      setWeight(result.athlete.weight_class ?? '');
      setPhone(result.athlete.phone ?? '');
      setZip(result.athlete.zip_code ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load coach profile');
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function changePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is required to update the profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.85,
    });
    if (result.canceled) return;
    setSaving(true);
    setError(null);
    try {
      const asset = result.assets[0];
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'coach-profile.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob);
      const uploaded = await apiFetch<{ photoUrl: string }>('/api/athletes/upload-photo', {
        method: 'POST',
        body: form,
      });
      setProfile((current) => current ? { ...current, photo_url: uploaded.photoUrl } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload photo');
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!profile || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await apiFetch('/api/athletes/profile', {
        method: 'PUT',
        body: JSON.stringify({
          weightClass: weight.trim() || null,
          bio: bio.trim() || null,
          credentials: profile.credentials ?? {},
          photoUrl: profile.photo_url ?? null,
          facilityId: profile.facility_id ?? null,
          secondaryFacilityId: profile.secondary_facility_id ?? null,
          active: profile.active !== false,
          phone,
          zipCode: zip,
          venmoHandle: profile.venmo_handle,
          zelleEmail: profile.zelle_email,
        }),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  if (!profile && !error) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>COACH PROFILE</Text>
      <Text style={styles.heading}>{selectedCoachName || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Your profile'}</Text>
      <Text style={styles.sub}>This is what parents and athletes see when choosing a coach.</Text>

      <Pressable style={styles.photoWrap} onPress={() => void changePhoto()}>
        {profile?.photo_url ? <Image source={{ uri: profile.photo_url }} style={styles.photo} /> : <View style={styles.photo} />}
        <View style={styles.photoButton}><Text style={styles.photoButtonText}>Change photo</Text></View>
      </Pressable>

      <Field label="SCHOOL / PROGRAM" value={profile?.school ?? ''} editable={false} />
      <Text style={styles.label}>BIO</Text>
      <TextInput
        value={bio}
        onChangeText={setBio}
        placeholder="Tell families about your wrestling and coaching background"
        placeholderTextColor={colors.textSecondary}
        multiline
        maxLength={500}
        style={[styles.input, styles.bio]}
      />
      <Text style={styles.count}>{bio.length}/500</Text>
      <Field label="WEIGHT CLASS" value={weight} onChangeText={setWeight} placeholder="157 lbs" />
      <Field label="CELL PHONE" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="919-555-0123" />
      <Field label="HOME ZIP" value={zip} onChangeText={setZip} keyboardType="number-pad" placeholder="27514" />

      <Pressable style={styles.locationLink} onPress={() => router.push('/coach-locations')}>
        <View><Text style={styles.locationTitle}>Training locations</Text><Text style={styles.locationMeta}>Manage gyms, schools, and wrestling rooms</Text></View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={styles.success}>Profile saved.</Text> : null}
      <Pressable style={[styles.save, saving && styles.disabled]} onPress={() => void save()} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveText}>Save coach profile</Text>}
      </Pressable>
    </ScrollView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...inputProps} placeholderTextColor={colors.textSecondary} style={[styles.input, !inputProps.editable && styles.readOnly]} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 32, marginTop: 6 },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 6 },
  photoWrap: { alignSelf: 'center', marginVertical: 20, alignItems: 'center' },
  photo: { width: 150, height: 170, borderRadius: 8, backgroundColor: colors.surface, resizeMode: 'cover' },
  photoButton: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, marginTop: -16 },
  photoButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 12 },
  label: { ...typography.brand, color: colors.accent, fontSize: 10, marginTop: 16, marginBottom: 6 },
  input: { ...typography.body, color: colors.text, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 14, backgroundColor: colors.surface },
  bio: { minHeight: 130, paddingTop: 12, textAlignVertical: 'top' },
  count: { ...typography.body, color: colors.textSecondary, fontSize: 10, textAlign: 'right', marginTop: 4 },
  readOnly: { color: colors.textSecondary },
  locationLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 16, marginTop: 22 },
  locationTitle: { ...typography.bodyBold, color: colors.text },
  locationMeta: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  arrow: { color: colors.accent, fontSize: 28 },
  save: { minHeight: 52, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderRadius: 4, marginTop: 20 },
  saveText: { ...typography.bodyBold, color: colors.black },
  disabled: { opacity: 0.6 },
  error: { ...typography.body, color: colors.danger, marginTop: 14 },
  success: { ...typography.bodySemi, color: colors.success, marginTop: 14 },
});
