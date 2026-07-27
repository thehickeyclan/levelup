import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';

type Facility = {
  id: string;
  name: string;
  address?: string | null;
  directions?: string | null;
  is_primary?: boolean;
  is_recent?: boolean;
  last_used_at?: string | null;
};

export default function CoachLocationsScreen() {
  const { user, role, selectedCoachId, selectedCoachName } = useAuth();
  const coachId = role === 'admin' ? selectedCoachId : role === 'coach' ? user?.id ?? null : null;
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [directions, setDirections] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!coachId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await apiFetch<{ facilities: Facility[] }>(
        `/api/coaches/locations?coachId=${encodeURIComponent(coachId)}`
      );
      setFacilities(data.facilities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load locations');
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (role !== 'coach' && role !== 'admin') return <Redirect href="/(tabs)" />;
  if (role === 'admin' && !selectedCoachId) return <Redirect href="/select-coach" />;

  async function addLocation() {
    if (!coachId || saving) return;
    if (!name.trim() || !address.trim()) {
      setError('Enter both a location name and street address.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<{ facility: Facility }>('/api/coaches/locations', {
        method: 'POST',
        body: JSON.stringify({
          coachId: role === 'admin' ? coachId : undefined,
          name: name.trim(),
          address: address.trim(),
          directions: directions.trim() || undefined,
        }),
      });
      setFacilities((current) => [
        ...current.filter((facility) => facility.id !== data.facility.id),
        data.facility,
      ]);
      setName('');
      setAddress('');
      setDirections('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add location');
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(facilityId: string) {
    if (!coachId || settingDefaultId) return;
    setSettingDefaultId(facilityId);
    setError(null);
    try {
      await apiFetch('/api/coaches/locations', {
        method: 'PATCH',
        body: JSON.stringify({
          coachId: role === 'admin' ? coachId : undefined,
          facilityId,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the default location');
    } finally {
      setSettingDefaultId(null);
    }
  }

  return (
    <FlatList
      style={styles.screen}
      data={facilities}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.kicker}>TRAINING LOCATIONS</Text>
          <Text style={styles.heading}>Where do you coach?</Text>
          <Text style={styles.intro}>
            {role === 'admin' && selectedCoachName ? `${selectedCoachName} · ` : ''}
            Add each gym, school, or wrestling room families can book.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>LOCATION NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Example: UNC Wrestling Facility"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
            />
            <Text style={styles.label}>STREET ADDRESS</Text>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Full address"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              style={styles.input}
            />
            <Text style={styles.label}>DIRECTIONS (OPTIONAL)</Text>
            <TextInput
              value={directions}
              onChangeText={setDirections}
              placeholder="Entrance, parking, mat room..."
              placeholderTextColor={colors.textSecondary}
              multiline
              style={[styles.input, styles.multiline]}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={[styles.add, saving && styles.disabled]} onPress={() => void addLocation()} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.addText}>Add location</Text>}
            </Pressable>
          </View>
          <Text style={styles.section}>CURRENT LOCATIONS</Text>
          {loading ? <ActivityIndicator color={colors.accent} /> : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.locationHeader}>
            <Text style={styles.locationName}>{item.name}</Text>
            <View style={styles.badges}>
              {item.is_primary ? (
                <View style={styles.primaryBadge}><Text style={styles.primaryBadgeText}>DEFAULT</Text></View>
              ) : item.is_recent ? (
                <View style={styles.recentBadge}><Text style={styles.recentBadgeText}>RECENT</Text></View>
              ) : null}
            </View>
          </View>
          {item.address ? <Text style={styles.meta}>{item.address}</Text> : null}
          {item.directions ? <Text style={styles.directions}>{item.directions}</Text> : null}
          {!item.is_primary ? (
            <Pressable
              style={styles.defaultButton}
              onPress={() => void makeDefault(item.id)}
              disabled={settingDefaultId != null}
            >
              <Text style={styles.defaultButtonText}>
                {settingDefaultId === item.id ? 'Updating…' : 'Make default'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      ListEmptyComponent={!loading ? <Text style={styles.empty}>No training locations yet.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20, paddingBottom: 48 },
  header: { marginBottom: 10 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 29 },
  intro: { ...typography.body, color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  form: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 14, marginTop: 18 },
  label: { ...typography.brand, color: colors.textSecondary, fontSize: 9, marginTop: 11, marginBottom: 7 },
  input: { ...typography.body, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 5, color: colors.text, backgroundColor: colors.background, paddingHorizontal: 12 },
  multiline: { minHeight: 74, paddingTop: 12, textAlignVertical: 'top' },
  error: { ...typography.body, color: colors.danger, marginTop: 12 },
  add: { minHeight: 50, backgroundColor: colors.accent, borderRadius: 5, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  addText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  disabled: { opacity: 0.5 },
  section: { ...typography.brand, color: colors.accent, fontSize: 10, marginTop: 24, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 5, padding: 15, marginBottom: 9 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationName: { ...typography.bodySemi, color: colors.text, fontSize: 15, flex: 1 },
  badges: { flexDirection: 'row', gap: 5 },
  primaryBadge: { backgroundColor: 'rgba(184,157,96,0.18)', borderRadius: 3, paddingHorizontal: 7, paddingVertical: 4 },
  primaryBadgeText: { ...typography.brand, color: colors.accent, fontSize: 8 },
  recentBadge: { borderWidth: 1, borderColor: colors.border, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 4 },
  recentBadgeText: { ...typography.brand, color: colors.textSecondary, fontSize: 8 },
  meta: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 5 },
  directions: { ...typography.body, color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 7 },
  defaultButton: { alignSelf: 'flex-start', marginTop: 12, borderWidth: 1, borderColor: colors.accent, borderRadius: 4, paddingHorizontal: 11, paddingVertical: 7 },
  defaultButtonText: { ...typography.bodySemi, color: colors.accent, fontSize: 11 },
  empty: { ...typography.body, color: colors.textMuted, marginTop: 10 },
});
