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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type Wrestler = {
  id: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  school?: string | null;
  graduation_year?: number | null;
  weight_class?: string | null;
  skill_level?: string | null;
  wrestling_experience?: string | null;
  goals?: string | null;
  medical_notes?: string | null;
  photo_url?: string | null;
  phone?: string | null;
  zip_code?: string | null;
};

export default function WrestlerEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';
  const [record, setRecord] = useState<Wrestler | null>(isNew ? { id: 'new' } : null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [school, setSchool] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [weight, setWeight] = useState('');
  const [skill, setSkill] = useState('');
  const [phone, setPhone] = useState('');
  const [zip, setZip] = useState('');
  const [goals, setGoals] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const result = await apiFetch<{ youthWrestler: Wrestler }>(`/api/youth-wrestlers/${id}`);
      const w = result.youthWrestler;
      setRecord(w);
      setFirst(w.first_name ?? '');
      setLast(w.last_name ?? '');
      setSchool(w.school ?? '');
      setGraduationYear(w.graduation_year ? String(w.graduation_year) : '');
      setWeight(w.weight_class ?? '');
      setSkill(w.skill_level ?? '');
      setPhone(w.phone ?? '');
      setZip(w.zip_code ?? '');
      setGoals(w.goals ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wrestler');
    }
  }, [id, isNew]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function changePhoto() {
    if (!record || record.id === 'new') {
      setError('Save the wrestler profile before adding a photo.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled) return;
    setSaving(true);
    try {
      const asset = result.assets[0];
      const form = new FormData();
      form.append('youthWrestlerId', record.id);
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName || 'wrestler.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob);
      const uploaded = await apiFetch<{ photoUrl: string }>('/api/youth-wrestlers/upload-photo', { method: 'POST', body: form });
      setRecord((current) => current ? { ...current, photo_url: uploaded.photoUrl } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload photo');
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!first.trim() || !last.trim() || !graduationYear.trim() || !phone.trim() || !zip.trim()) {
      setError('First name, last name, graduation year, phone, and ZIP are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        firstName: first.trim(),
        lastName: last.trim(),
        dateOfBirth: record?.date_of_birth ?? null,
        school: school.trim() || null,
        graduationYear: Number(graduationYear),
        weightClass: weight.trim() || null,
        skillLevel: skill.trim() || null,
        wrestlingExperience: record?.wrestling_experience ?? null,
        goals: goals.trim() || null,
        medicalNotes: record?.medical_notes ?? null,
        photoUrl: record?.photo_url ?? null,
        phone,
        zipCode: zip,
      };
      if (isNew) {
        const created = await apiFetch<{ youthWrestler: Wrestler }>('/api/youth-wrestlers', { method: 'POST', body: JSON.stringify(body) });
        router.replace(`/wrestler-edit/${created.youthWrestler.id}`);
      } else {
        await apiFetch(`/api/youth-wrestlers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        router.back();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save wrestler');
    } finally {
      setSaving(false);
    }
  }

  if (!record && !error) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>WRESTLER PROFILE</Text>
      <Text style={styles.heading}>{isNew ? 'Add a wrestler' : `${first} ${last}`.trim()}</Text>
      {!isNew ? (
        <Pressable style={styles.photoWrap} onPress={() => void changePhoto()}>
          {record?.photo_url ? <Image source={{ uri: record.photo_url }} style={styles.photo} /> : <View style={styles.photo} />}
          <Text style={styles.changePhoto}>Change photo</Text>
        </Pressable>
      ) : null}
      <Field label="FIRST NAME" value={first} onChangeText={setFirst} />
      <Field label="LAST NAME" value={last} onChangeText={setLast} />
      <Field label="SCHOOL" value={school} onChangeText={setSchool} />
      <Field label="GRADUATION YEAR" value={graduationYear} onChangeText={setGraduationYear} keyboardType="number-pad" placeholder="2030" />
      <Field label="WEIGHT" value={weight} onChangeText={setWeight} placeholder="120 lbs" />
      <Field label="SKILL LEVEL" value={skill} onChangeText={setSkill} placeholder="Beginner, intermediate, advanced…" />
      <Field label="ATHLETE PHONE" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="HOME ZIP" value={zip} onChangeText={setZip} keyboardType="number-pad" />
      <Text style={styles.label}>TRAINING GOALS</Text>
      <TextInput value={goals} onChangeText={setGoals} multiline placeholder="What does this wrestler want to improve?" placeholderTextColor={colors.textSecondary} style={[styles.input, styles.textarea]} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.save, saving && styles.disabled]} onPress={() => void save()} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveText}>{isNew ? 'Create wrestler profile' : 'Save changes'}</Text>}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <><Text style={styles.label}>{label}</Text><TextInput {...props} placeholderTextColor={colors.textSecondary} style={styles.input} /></>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 32, marginTop: 6 },
  photoWrap: { alignSelf: 'center', alignItems: 'center', marginVertical: 20 },
  photo: { width: 130, height: 130, borderRadius: 65, backgroundColor: colors.surface },
  changePhoto: { ...typography.bodyBold, color: colors.accent, marginTop: 8 },
  label: { ...typography.brand, color: colors.accent, fontSize: 10, marginTop: 16, marginBottom: 6 },
  input: { ...typography.body, color: colors.text, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 14, backgroundColor: colors.surface },
  textarea: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  error: { ...typography.body, color: colors.danger, marginTop: 14 },
  save: { minHeight: 52, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderRadius: 4, marginTop: 20 },
  saveText: { ...typography.bodyBold, color: colors.black },
  disabled: { opacity: 0.6 },
});
