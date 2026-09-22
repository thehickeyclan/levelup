import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { WEB_ORIGIN } from '@/lib/config';
import { colors, typography } from '@/lib/theme';

type SessionType = 'small_group' | 'partner' | 'private';
type Facility = {
  id: string;
  name: string;
  is_primary?: boolean;
};

const SESSION_DEFAULTS: Record<
  SessionType,
  { label: string; capacity: number; price: number; detail: string }
> = {
  private: { label: 'Private', capacity: 1, price: 60, detail: 'One-on-one' },
  partner: { label: 'Partner', capacity: 2, price: 50, detail: 'Two athletes' },
  small_group: { label: 'Small group', capacity: 6, price: 30, detail: 'Several athletes' },
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

const DATE_OPTIONS = Array.from({ length: 14 }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() + index);
  return {
    value: localDateKey(date),
    weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
    date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    long: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
  };
});

/**
 * One-tap session offer from a message thread. Price comes from the standard
 * rates (private $60 / partner $50 / group $30); the coach can override but is
 * never asked. Creates an invite-only session and drops a booking link into
 * the conversation.
 */
export default function OfferSessionScreen() {
  const router = useRouter();
  const {
    thread: threadId,
    to,
    format: requestedFormat,
    date: requestedDate,
    time: requestedTime,
  } = useLocalSearchParams<{
    thread: string;
    to?: string;
    format?: string;
    date?: string;
    time?: string;
  }>();
  const { user, role, selectedCoachId } = useAuth();
  const coachId = role === 'admin' ? selectedCoachId : role === 'coach' ? user?.id ?? null : null;

  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState('');
  // Accepting a parent's request prefills their format/day/time; anything
  // invalid or in the past falls back to the defaults.
  const [sessionType, setSessionType] = useState<SessionType>(() =>
    requestedFormat && requestedFormat in SESSION_DEFAULTS
      ? (requestedFormat as SessionType)
      : 'private'
  );
  const [scheduledDate, setScheduledDate] = useState(() =>
    requestedDate && DATE_OPTIONS.some((option) => option.value === requestedDate)
      ? requestedDate
      : DATE_OPTIONS[1]?.value ?? DATE_OPTIONS[0].value
  );
  const [scheduledTime, setScheduledTime] = useState(() =>
    requestedTime && TIME_OPTIONS.includes(requestedTime) ? requestedTime : '17:00'
  );
  const [priceOverride, setPriceOverride] = useState<string | null>(null);
  const [privateOffer, setPrivateOffer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          : list.find((facility) => facility.is_primary)?.id ?? list[0]?.id ?? ''
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

  const defaults = SESSION_DEFAULTS[sessionType];
  const price = priceOverride != null ? Number(priceOverride) : defaults.price;
  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.id === facilityId),
    [facilities, facilityId]
  );
  const selectedDate = DATE_OPTIONS.find((option) => option.value === scheduledDate);

  if (role !== 'coach' && role !== 'admin') return <Redirect href="/(tabs)" />;
  if (!threadId) return <Redirect href="/(tabs)" />;

  async function sendOffer() {
    if (!coachId || saving) return;
    if (!facilityId) {
      setError('Choose a training location first.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter a valid price.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ sessionId: string }>('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify({
          athleteId: coachId,
          facilityId,
          scheduledDate,
          scheduledTime,
          durationMinutes: 60,
          maxParticipants: defaults.capacity,
          pricePerParticipant: price,
          sessionType,
          joinPolicy: privateOffer ? 'invite_only' : 'public',
          // Private partner/group offers: leftover spots open publicly once
          // the family this offer was made to books.
          openSpotsAfterFirstBooking: privateOffer && sessionType !== 'private',
          published: true,
        }),
      });
      // No price in the chat — the family sees the rate at checkout.
      const body =
        `Session offer — ${defaults.label} · ${selectedDate?.long ?? scheduledDate} · ` +
        `${formatTime(scheduledTime)}${selectedFacility ? ` · ${selectedFacility.name}` : ''}. ` +
        `Book here: ${WEB_ORIGIN}/sessions/${created.sessionId}`;
      await apiFetch(`/api/guild/messages/threads/${threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, deliveryChannel: 'in_app' }),
      });
      Alert.alert('Offer sent', 'The session is created and the booking link is in the conversation.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the offer');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>SESSION OFFER</Text>
      <Text style={styles.heading}>Offer a session</Text>
      <Text style={styles.intro}>
        {to ? `${to} gets` : 'The family gets'} a booking link in this conversation. Standard
        pricing applies automatically.
      </Text>

      <Text style={styles.label}>FORMAT</Text>
      <View style={styles.typeRow}>
        {(Object.keys(SESSION_DEFAULTS) as SessionType[]).map((type) => {
          const selected = sessionType === type;
          return (
            <Pressable
              key={type}
              style={[styles.typeButton, selected && styles.typeButtonSelected]}
              onPress={() => {
                setSessionType(type);
                setPriceOverride(null);
              }}
            >
              <Text style={[styles.typeTitle, selected && styles.typeTitleSelected]}>
                {SESSION_DEFAULTS[type].label}
              </Text>
              <Text style={[styles.typeDetail, selected && styles.typeDetailSelected]}>
                ${SESSION_DEFAULTS[type].price}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>DAY</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {DATE_OPTIONS.map((option) => {
          const selected = option.value === scheduledDate;
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setScheduledDate(option.value)}
            >
              <Text style={[styles.chipSmall, selected && styles.chipTextSelected]}>{option.weekday}</Text>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.date}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>TIME</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {TIME_OPTIONS.map((option) => {
          const selected = option === scheduledTime;
          return (
            <Pressable
              key={option}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setScheduledTime(option)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {formatTime(option)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {facilities.length > 1 ? (
        <>
          <Text style={styles.label}>LOCATION</Text>
          <View style={styles.facilityList}>
            {facilities.map((facility) => {
              const selected = facility.id === facilityId;
              return (
                <Pressable
                  key={facility.id}
                  style={[styles.facilityRow, selected && styles.facilityRowSelected]}
                  onPress={() => setFacilityId(facility.id)}
                >
                  <Text style={[styles.facilityName, selected && styles.chipTextSelected]}>
                    {facility.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <View style={styles.privateRow}>
        <View style={styles.privateCopy}>
          <Text style={styles.privateTitle}>Private offer</Text>
          <Text style={styles.privateDetail}>
            {privateOffer
              ? sessionType === 'private'
                ? 'Only this conversation gets the link.'
                : 'Link-only until they book — leftover spots then open publicly.'
              : 'Open spots are listed publicly and alert followers.'}
          </Text>
        </View>
        <Switch
          value={privateOffer}
          onValueChange={setPrivateOffer}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor={colors.text}
        />
      </View>

      {priceOverride == null ? (
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>
            ${defaults.price} · standard {defaults.label.toLowerCase()} rate
          </Text>
          <Pressable onPress={() => setPriceOverride(String(defaults.price))} hitSlop={8}>
            <Text style={styles.priceAdjust}>Adjust</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>Price $</Text>
          <TextInput
            style={styles.priceInput}
            value={priceOverride}
            onChangeText={setPriceOverride}
            keyboardType="number-pad"
            autoFocus
          />
          <Pressable onPress={() => setPriceOverride(null)} hitSlop={8}>
            <Text style={styles.priceAdjust}>Use standard</Text>
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.send, saving && styles.disabled]}
        onPress={() => void sendOffer()}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.black} />
        ) : (
          <Text style={styles.sendText}>
            Send offer · {defaults.label} {selectedDate ? selectedDate.long : ''} at{' '}
            {formatTime(scheduledTime)}
          </Text>
        )}
      </Pressable>
      <Text style={styles.footnote}>
        {privateOffer
          ? 'Invite-only — the session never appears in public listings, only through this conversation’s link.'
          : 'The family books from this conversation; any spots left open are visible in public listings and followers get an alert.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 12, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 30, marginBottom: 8 },
  intro: { ...typography.body, color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 18 },
  label: { ...typography.bodyBold, color: colors.textMuted, fontSize: 11, letterSpacing: 1, marginBottom: 8, marginTop: 14 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  typeButtonSelected: { borderColor: colors.accent, backgroundColor: colors.surface },
  typeTitle: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  typeTitleSelected: { color: colors.accent },
  typeDetail: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 3 },
  typeDetailSelected: { color: colors.accent },
  chipRow: { gap: 8, paddingRight: 20 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.surface },
  chipSmall: { ...typography.body, color: colors.textMuted, fontSize: 10 },
  chipText: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  chipTextSelected: { color: colors.accent },
  facilityList: { gap: 8 },
  facilityRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  facilityRowSelected: { borderColor: colors.accent, backgroundColor: colors.surface },
  facilityName: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  privateCopy: { flex: 1 },
  privateTitle: { ...typography.bodySemi, color: colors.text, fontSize: 14 },
  privateDetail: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  priceText: { ...typography.bodySemi, color: colors.text, fontSize: 14 },
  priceInput: {
    ...typography.bodySemi,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  priceAdjust: { ...typography.bodySemi, color: colors.accent, fontSize: 13 },
  error: { ...typography.body, color: colors.danger, fontSize: 13, marginTop: 14 },
  send: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    paddingHorizontal: 14,
  },
  sendText: { ...typography.bodyBold, color: colors.black, fontSize: 14, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  footnote: { ...typography.body, color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 12 },
});
