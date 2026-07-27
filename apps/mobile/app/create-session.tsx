import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, typography } from '@/lib/theme';

type SessionType = 'small_group' | 'partner' | 'private';
type JoinPolicy = 'public' | 'invite_only';
type Facility = {
  id: string;
  name: string;
  school?: string | null;
  address?: string | null;
  is_primary?: boolean;
  is_recent?: boolean;
};

const SESSION_DEFAULTS: Record<
  SessionType,
  { label: string; capacity: number; price: number; detail: string }
> = {
  small_group: { label: 'Small group', capacity: 6, price: 30, detail: 'Several athletes' },
  partner: { label: 'Partner', capacity: 2, price: 50, detail: 'Two athletes' },
  private: { label: 'Private', capacity: 1, price: 60, detail: 'One-on-one' },
};

const TIME_OPTIONS = Array.from({ length: 33 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

const DATE_OPTIONS = Array.from({ length: 21 }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() + index);
  return {
    value: localDateKey(date),
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
    date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
});

export default function CreateSessionScreen() {
  const router = useRouter();
  const { user, role, selectedCoachId, selectedCoachName } = useAuth();
  const coachId = role === 'admin' ? selectedCoachId : role === 'coach' ? user?.id ?? null : null;
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('small_group');
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>('public');
  const [scheduledDate, setScheduledDate] = useState(DATE_OPTIONS[1]?.value ?? DATE_OPTIONS[0].value);
  const [scheduledTime, setScheduledTime] = useState('17:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [maxParticipants, setMaxParticipants] = useState(6);
  const [price, setPrice] = useState('30');
  const [focusArea, setFocusArea] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTimes, setShowTimes] = useState(false);
  const [shareAddressAfterBooking, setShareAddressAfterBooking] = useState(false);

  const coachName = role === 'admin' ? selectedCoachName : 'Your session';

  const loadFacilities = useCallback(async () => {
    if (!coachId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await apiFetch<{ facilities: Facility[] }>(
        `/api/coaches/locations?coachId=${encodeURIComponent(coachId)}`
      );
      const list = data.facilities ?? [];
      setFacilities(list);
      setFacilityId((current) =>
        current && list.some((facility) => facility.id === current)
          ? current
          : list[0]?.id ?? ''
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load locations');
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useFocusEffect(
    useCallback(() => {
      void loadFacilities();
    }, [loadFacilities])
  );

  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.id === facilityId),
    [facilities, facilityId]
  );

  if (role !== 'coach' && role !== 'admin') return <Redirect href="/(tabs)" />;
  if (role === 'admin' && !selectedCoachId) return <Redirect href="/select-coach" />;

  function chooseType(type: SessionType) {
    const defaults = SESSION_DEFAULTS[type];
    setSessionType(type);
    setMaxParticipants(defaults.capacity);
    setPrice(String(defaults.price));
  }

  async function create() {
    if (!coachId || saving) return;
    if (!facilityId) {
      setError('Choose a training location before creating the session.');
      return;
    }
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter a valid price.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<{ sessionId: string }>('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({
          athleteId: coachId,
          facilityId,
          scheduledDate,
          scheduledTime,
          durationMinutes,
          maxParticipants,
          pricePerParticipant: amount,
          sessionType,
          joinPolicy,
          focusArea: focusArea.trim() || undefined,
          locationVisibility:
            sessionType === 'private' && shareAddressAfterBooking
              ? 'participants_only'
              : 'public',
          published: true,
        }),
      });
      Alert.alert('Session created', 'The session is live and families can now find it.', [
        { text: 'View session', onPress: () => router.replace(`/session/${data.sessionId}`) },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create session');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>COACH SESSION</Text>
        <Text style={styles.heading}>Create training</Text>
        <Text style={styles.intro}>
          {coachName ? `${coachName} · ` : ''}Choose the format, place, and time. The session becomes
          available immediately.
        </Text>

        <Text style={styles.label}>SESSION TYPE</Text>
        <View style={styles.typeRow}>
          {(Object.keys(SESSION_DEFAULTS) as SessionType[]).map((type) => {
            const selected = sessionType === type;
            return (
              <Pressable
                key={type}
                style={[styles.typeButton, selected && styles.typeButtonSelected]}
                onPress={() => chooseType(type)}
              >
                <Text style={[styles.typeTitle, selected && styles.typeTitleSelected]}>
                  {SESSION_DEFAULTS[type].label}
                </Text>
                <Text style={[styles.typeDetail, selected && styles.typeDetailSelected]}>
                  {SESSION_DEFAULTS[type].detail}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>DATE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {DATE_OPTIONS.map((option) => {
            const selected = option.value === scheduledDate;
            return (
              <Pressable
                key={option.value}
                style={[styles.dateButton, selected && styles.dateButtonSelected]}
                onPress={() => setScheduledDate(option.value)}
              >
                <Text style={[styles.dateWeekday, selected && styles.selectedText]}>{option.weekday}</Text>
                <Text style={[styles.dateValue, selected && styles.selectedText]}>{option.date}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.twoColumns}>
          <View style={styles.column}>
            <Text style={styles.label}>START TIME</Text>
            <Pressable style={styles.fieldButton} onPress={() => setShowTimes(true)}>
              <Text style={styles.fieldValue}>{formatTime(scheduledTime)}</Text>
            </Pressable>
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>DURATION</Text>
            <View style={styles.inlineChoices}>
              {[60, 90, 120].map((minutes) => (
                <Pressable
                  key={minutes}
                  style={[styles.smallChoice, durationMinutes === minutes && styles.smallChoiceSelected]}
                  onPress={() => setDurationMinutes(minutes)}
                >
                  <Text style={[styles.smallChoiceText, durationMinutes === minutes && styles.selectedText]}>
                    {minutes}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.label}>LOCATION</Text>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {!loading && facilities.length === 0 ? (
          <Pressable style={styles.emptyLocation} onPress={() => router.push('/coach-locations')}>
            <Text style={styles.emptyLocationTitle}>Add a training location</Text>
            <Text style={styles.emptyLocationText}>A location is required before publishing.</Text>
          </Pressable>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.facilityRow}>
            {facilities.map((facility) => {
              const selected = facility.id === facilityId;
              return (
                <Pressable
                  key={facility.id}
                  style={[styles.facilityButton, selected && styles.facilityButtonSelected]}
                  onPress={() => setFacilityId(facility.id)}
                >
                  <Text style={[styles.facilityName, selected && styles.selectedText]}>{facility.name}</Text>
                  {facility.is_primary || facility.is_recent ? (
                    <Text style={[styles.facilityBadge, selected && styles.typeDetailSelected]}>
                      {facility.is_primary ? 'DEFAULT' : 'RECENTLY USED'}
                    </Text>
                  ) : null}
                  {facility.address ? (
                    <Text style={[styles.facilityAddress, selected && styles.typeDetailSelected]} numberOfLines={2}>
                      {facility.address}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {selectedFacility?.address ? <Text style={styles.selectedLocation}>{selectedFacility.address}</Text> : null}
        <Pressable style={styles.manageLocations} onPress={() => router.push('/coach-locations')}>
          <Text style={styles.manageLocationsText}>Manage or add locations</Text>
        </Pressable>

        {sessionType === 'private' ? (
          <Pressable
            style={styles.privacyRow}
            onPress={() => setShareAddressAfterBooking((current) => !current)}
          >
            <View style={[styles.checkbox, shareAddressAfterBooking && styles.checkboxSelected]}>
              {shareAddressAfterBooking ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyTitle}>Share exact address after booking</Text>
              <Text style={styles.privacyDetail}>
                Families see the location name now. Only registered families receive the street address.
              </Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.twoColumns}>
          {sessionType === 'small_group' ? (
            <View style={styles.column}>
              <Text style={styles.label}>CAPACITY</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepButton} onPress={() => setMaxParticipants(Math.max(2, maxParticipants - 1))}>
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{maxParticipants}</Text>
                <Pressable style={styles.stepButton} onPress={() => setMaxParticipants(Math.min(20, maxParticipants + 1))}>
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <View style={styles.column}>
            <Text style={styles.label}>PRICE / ATHLETE</Text>
            <View style={styles.priceField}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                style={styles.priceInput}
              />
            </View>
          </View>
        </View>

        <Text style={styles.label}>FOCUS (OPTIONAL)</Text>
        <TextInput
          value={focusArea}
          onChangeText={setFocusArea}
          placeholder="Examples: neutral offense, top work"
          placeholderTextColor={colors.textSecondary}
          style={styles.textInput}
        />

        <Text style={styles.label}>WHO CAN JOIN?</Text>
        <View style={styles.policyRow}>
          {(['public', 'invite_only'] as JoinPolicy[]).map((policy) => {
            const selected = joinPolicy === policy;
            return (
              <Pressable
                key={policy}
                style={[styles.policyButton, selected && styles.policyButtonSelected]}
                onPress={() => setJoinPolicy(policy)}
              >
                <Text style={[styles.policyTitle, selected && styles.selectedText]}>
                  {policy === 'public' ? 'Public' : 'Invite only'}
                </Text>
                <Text style={[styles.policyDetail, selected && styles.typeDetailSelected]}>
                  {policy === 'public' ? 'Visible to Guild families' : 'Only people with the link'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.createButton, saving && styles.disabled]} onPress={() => void create()} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.createText}>Create session</Text>}
        </Pressable>
      </ScrollView>

      <Modal visible={showTimes} transparent animationType="slide" onRequestClose={() => setShowTimes(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowTimes(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choose start time</Text>
              <Pressable onPress={() => setShowTimes(false)}><Text style={styles.done}>Done</Text></Pressable>
            </View>
            <FlatList
              data={TIME_OPTIONS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.timeOption, item === scheduledTime && styles.timeOptionSelected]}
                  onPress={() => {
                    setScheduledTime(item);
                    setShowTimes(false);
                  }}
                >
                  <Text style={[styles.timeOptionText, item === scheduledTime && styles.selectedTimeText]}>
                    {formatTime(item)}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 30 },
  intro: { ...typography.body, color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 18 },
  label: { ...typography.brand, color: colors.textSecondary, fontSize: 9, marginTop: 17, marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 7 },
  typeButton: { flex: 1, minHeight: 72, borderWidth: 1, borderColor: colors.border, borderRadius: 5, padding: 10, justifyContent: 'center' },
  typeButtonSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  typeTitle: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  typeTitleSelected: { color: colors.black },
  typeDetail: { ...typography.body, color: colors.textSecondary, fontSize: 10, marginTop: 4 },
  typeDetailSelected: { color: '#3D3524' },
  dateRow: { gap: 8 },
  dateButton: { width: 76, minHeight: 62, borderWidth: 1, borderColor: colors.border, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  dateButtonSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  dateWeekday: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 10 },
  dateValue: { ...typography.bodySemi, color: colors.text, fontSize: 13, marginTop: 4 },
  selectedText: { color: colors.black },
  twoColumns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1 },
  fieldButton: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 5, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.surface },
  fieldValue: { ...typography.bodySemi, color: colors.text, fontSize: 14 },
  inlineChoices: { flexDirection: 'row', gap: 5 },
  smallChoice: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 5 },
  smallChoiceSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  smallChoiceText: { ...typography.bodySemi, color: colors.text, fontSize: 12 },
  facilityRow: { gap: 8 },
  facilityButton: { width: 190, minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 5, padding: 11, justifyContent: 'center', backgroundColor: colors.surface },
  facilityButtonSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  facilityName: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  facilityBadge: { ...typography.brand, color: colors.accent, fontSize: 8, marginTop: 5 },
  facilityAddress: { ...typography.body, color: colors.textSecondary, fontSize: 10, marginTop: 4 },
  selectedLocation: { ...typography.body, color: colors.textSecondary, fontSize: 11, marginTop: 7 },
  manageLocations: { alignSelf: 'flex-start', paddingVertical: 9 },
  manageLocationsText: { ...typography.bodySemi, color: colors.accent, fontSize: 11 },
  privacyRow: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 5, padding: 13, marginTop: 6 },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  privacyTitle: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  privacyDetail: { ...typography.body, color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  emptyLocation: { borderWidth: 1, borderColor: colors.danger, borderRadius: 5, padding: 14, backgroundColor: colors.surface },
  emptyLocationTitle: { ...typography.bodySemi, color: colors.text, fontSize: 14 },
  emptyLocationText: { ...typography.body, color: colors.textMuted, fontSize: 11, marginTop: 4 },
  stepper: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 5 },
  stepButton: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  stepText: { ...typography.body, color: colors.accent, fontSize: 24 },
  stepValue: { ...typography.bodySemi, color: colors.text, fontSize: 16, flex: 1, textAlign: 'center' },
  priceField: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 5, paddingHorizontal: 12, backgroundColor: colors.surface },
  dollar: { ...typography.bodySemi, color: colors.accent, fontSize: 18 },
  priceInput: { ...typography.bodySemi, color: colors.text, fontSize: 17, flex: 1, paddingHorizontal: 6 },
  textInput: { ...typography.body, minHeight: 50, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 5, paddingHorizontal: 12, backgroundColor: colors.surface },
  policyRow: { flexDirection: 'row', gap: 8 },
  policyButton: { flex: 1, minHeight: 68, borderWidth: 1, borderColor: colors.border, borderRadius: 5, padding: 11, justifyContent: 'center' },
  policyButtonSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  policyTitle: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  policyDetail: { ...typography.body, color: colors.textSecondary, fontSize: 10, marginTop: 3 },
  error: { ...typography.body, color: colors.danger, marginTop: 14 },
  createButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 5, marginTop: 20 },
  createText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  disabled: { opacity: 0.5 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { height: '58%', backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { ...typography.bodySemi, color: colors.text, fontSize: 18 },
  done: { ...typography.bodyBold, color: colors.accent, fontSize: 14, padding: 10 },
  timeOption: { height: 52, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  timeOptionSelected: { backgroundColor: 'rgba(184,157,96,0.18)' },
  timeOptionText: { ...typography.body, color: colors.text, fontSize: 16 },
  selectedTimeText: { ...typography.bodyBold, color: colors.accent },
});
