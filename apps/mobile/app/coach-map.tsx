import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import MapView, { Callout, Marker } from 'react-native-maps';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type CoachMapPin = {
  pinKey: string;
  coachId: string;
  firstName: string;
  lastName: string;
  school: string | null;
  averageRating: number | null;
  reviewCount: number | null;
  facilityId: string;
  facilityName: string;
  facilityAddress: string | null;
  latitude: number;
  longitude: number;
  hasOpenSession: boolean;
};

/** North Carolina fits this frame; adjust if the Guild expands beyond the state. */
const NC_REGION = {
  latitude: 35.5,
  longitude: -79.4,
  latitudeDelta: 4.4,
  longitudeDelta: 5.6,
};

/**
 * Coaches sharing a facility would stack at identical coordinates; fan them out
 * in a small ring so every pin stays tappable.
 */
function spreadOverlapping(pins: CoachMapPin[]): (CoachMapPin & { lat: number; lng: number })[] {
  const byFacility = new Map<string, CoachMapPin[]>();
  for (const p of pins) {
    const list = byFacility.get(p.facilityId) ?? [];
    list.push(p);
    byFacility.set(p.facilityId, list);
  }
  const out: (CoachMapPin & { lat: number; lng: number })[] = [];
  for (const group of byFacility.values()) {
    group.forEach((p, i) => {
      if (group.length === 1 || i === 0) {
        out.push({ ...p, lat: p.latitude, lng: p.longitude });
      } else {
        const angle = (2 * Math.PI * i) / group.length;
        out.push({
          ...p,
          lat: p.latitude + 0.012 * Math.sin(angle),
          lng: p.longitude + 0.015 * Math.cos(angle),
        });
      }
    });
  }
  return out;
}

export default function CoachMapScreen() {
  const router = useRouter();
  const [pins, setPins] = useState<CoachMapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<{ pins: CoachMapPin[] }>('/api/map/coach-pins');
      setPins(res.pins ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the map');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const spread = useMemo(() => spreadOverlapping(pins), [pins]);

  return (
    <View style={styles.screen}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={NC_REGION} userInterfaceStyle="dark">
        {spread.map((p) => (
          <Marker
            key={p.pinKey}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor={p.hasOpenSession ? '#22C55E' : '#B89D60'}
          >
            <Callout onPress={() => router.push(`/coach/${p.coachId}`)}>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>
                  {p.firstName} {p.lastName}
                </Text>
                {p.school ? <Text style={styles.calloutMeta}>{p.school}</Text> : null}
                <Text style={styles.calloutMeta}>{p.facilityName}</Text>
                {p.reviewCount ? (
                  <Text style={styles.calloutMeta}>
                    ★ {Number(p.averageRating ?? 0).toFixed(1)} · {p.reviewCount} reviews
                  </Text>
                ) : null}
                <Text style={styles.calloutCta}>View profile & book →</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {loading ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {!loading && !error ? (
        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.legendText}>Has open sessions</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.legendText}>Coach location</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callout: { minWidth: 180, maxWidth: 240, padding: 4 },
  calloutName: { ...typography.bodySemi, fontSize: 15, color: '#111' },
  calloutMeta: { ...typography.body, fontSize: 12, color: '#555', marginTop: 2 },
  calloutCta: { ...typography.bodyBold, fontSize: 12, color: '#8a6d2f', marginTop: 6 },
  errorBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
  },
  errorText: { ...typography.body, color: colors.danger, fontSize: 13 },
  legend: {
    position: 'absolute',
    bottom: 24,
    left: 12,
    backgroundColor: 'rgba(10,10,10,0.85)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { ...typography.bodyMedium, fontSize: 12, color: colors.text },
});
