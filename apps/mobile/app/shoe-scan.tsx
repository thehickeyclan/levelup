import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type PickedPhoto = { uri: string; mimeType?: string | null; base64?: string | null };

type ScanResponse = {
  result?: {
    brand?: string;
    model?: string;
    colorway?: string;
    era?: string;
    rarity?: string;
    confidence?: number;
    confidence_note?: string;
    collector_notes?: string;
  };
  catalogMatched?: boolean;
  canonical?: { brand: string; model: string } | null;
  value?: {
    low_cents: number;
    mid_cents: number;
    high_cents: number;
    confidence: string;
    note: string;
    source: 'market' | 'ai';
  };
  counts?: { guild_sales: number; documented_comps: number; active_listings: number };
  ig?: {
    posts: number;
    priced: number;
    median_usd: number | null;
    recent_median_usd: number | null;
    min_usd: number | null;
    max_usd: number | null;
    span: string;
  } | null;
  error?: string;
};

const MAX_PHOTOS = 3;
const dollars = (cents: number) => `$${Math.round(cents / 100)}`;

export default function ShoeScanScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photosRef = useRef<PickedPhoto[]>([]);

  function addPicked(assets: ImagePicker.ImagePickerAsset[]) {
    setPhotos((current) => {
      const next = [
        ...current,
        ...assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType, base64: a.base64 })),
      ].slice(0, MAX_PHOTOS);
      photosRef.current = next;
      return next;
    });
  }

  async function takePhoto(askForAnother = true) {
    if (photosRef.current.length >= MAX_PHOTOS) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera access is required to scan a shoe.');
      return;
    }
    setError(null);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.55,
      base64: true,
    });
    if (!result.canceled) {
      addPicked(result.assets);
      if (askForAnother && photosRef.current.length < MAX_PHOTOS) {
        Alert.alert('Photo added', 'Add another angle? Side profile and sole help most.', [
          { text: 'Done', style: 'cancel' },
          { text: 'Take another', onPress: () => void takePhoto(true) },
        ]);
      }
    }
  }

  async function pickPhotos() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is required to scan a shoe.');
      return;
    }
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, MAX_PHOTOS - photos.length),
      quality: 0.55,
      base64: true,
    });
    if (!result.canceled) addPicked(result.assets);
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const next = current.filter((_, i) => i !== index);
      photosRef.current = next;
      return next;
    });
  }

  async function runScan() {
    if (scanning || photos.length === 0) return;
    setScanning(true);
    setError(null);
    setScan(null);
    try {
      const images = photos
        .filter((p) => p.base64)
        .map((p) => ({ base64: p.base64 as string, media_type: p.mimeType || 'image/jpeg' }));
      if (!images.length) {
        throw new Error('Could not read the photos — pick them again from your camera roll.');
      }
      const response = await apiFetch<ScanResponse>('/api/market/shoe-scan', {
        method: 'POST',
        body: JSON.stringify({ images }),
      });
      if (response.error) throw new Error(response.error);
      setScan(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed — try again.');
    } finally {
      setScanning(false);
    }
  }

  function reset() {
    setPhotos([]);
    photosRef.current = [];
    setScan(null);
    setError(null);
  }

  const identified = scan?.result;
  const displayBrand = scan?.canonical?.brand ?? identified?.brand;
  const displayModel = scan?.canonical?.model ?? identified?.model;
  const value = scan?.value;
  const counts = scan?.counts;
  const ig = scan?.ig;
  const confidencePct =
    identified?.confidence != null ? Math.round(identified.confidence * 100) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>SCANNER</Text>
      <Text style={styles.heading}>What's it worth?</Text>
      <Text style={styles.sub}>
        Snap any wrestling shoe. AI identifies the pair and shows its real market value — free, and
        nothing gets listed.
      </Text>

      {!scan ? (
        <>
          <View style={styles.photoRow}>
            {photos.map((photo, index) => (
              <View key={photo.uri} style={styles.photoWrap}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <Pressable style={styles.photoRemove} onPress={() => removePhoto(index)}>
                  <Text style={styles.photoRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable style={styles.photoAdd} onPress={() => void takePhoto(true)}>
                <Text style={styles.photoAddText}>＋</Text>
                <Text style={styles.photoAddLabel}>Camera</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable style={styles.libraryLink} onPress={() => void pickPhotos()}>
            <Text style={styles.libraryLinkText}>Pick from camera roll instead ›</Text>
          </Pressable>
          <Text style={styles.hint}>
            1–3 photos. The side profile does the most work; sole and heel settle the close calls.
          </Text>

          <Pressable
            style={[styles.scanButton, (photos.length === 0 || scanning) && styles.scanButtonDisabled]}
            disabled={photos.length === 0 || scanning}
            onPress={() => void runScan()}
          >
            {scanning ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.scanButtonText}>Identify & value</Text>
            )}
          </Pressable>
          {scanning ? (
            <Text style={styles.hint}>Checking your photos against the Guild catalog…</Text>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.resultCard}>
            <Text style={styles.resultKicker}>
              {scan.catalogMatched ? 'IN THE GUILD CATALOG' : 'BEST MATCH'}
            </Text>
            <Text style={styles.resultTitle}>
              {[displayBrand, displayModel].filter(Boolean).join(' ') || 'Unknown pair'}
            </Text>
            <Text style={styles.resultMeta}>
              {[identified?.colorway, identified?.era].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.chipRow}>
              {identified?.rarity ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{identified.rarity.toUpperCase()}</Text>
                </View>
              ) : null}
              {confidencePct != null ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{confidencePct}% MATCH</Text>
                </View>
              ) : null}
            </View>
            {identified?.confidence_note ? (
              <Text style={styles.resultNote}>{identified.confidence_note}</Text>
            ) : null}
          </View>

          {value ? (
            <View style={styles.valueCard}>
              <Text style={styles.resultKicker}>GUILD VALUE ESTIMATE</Text>
              <Text style={styles.valueBig}>~{dollars(value.mid_cents)}</Text>
              <Text style={styles.valueRange}>
                Range {dollars(value.low_cents)}–{dollars(value.high_cents)} · {value.confidence}{' '}
                confidence
              </Text>
              <Text style={styles.valueNote}>{value.note}</Text>
              {counts ? (
                <Text style={styles.sourceLine}>
                  {[
                    counts.guild_sales ? `${counts.guild_sales} Guild sales` : null,
                    counts.documented_comps ? `${counts.documented_comps} documented sales` : null,
                    counts.active_listings ? `${counts.active_listings} listed now` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No documented sales yet — AI estimate.'}
                </Text>
              ) : null}
            </View>
          ) : null}

          {ig && ig.priced > 0 ? (
            <View style={styles.igCard}>
              <Text style={styles.resultKicker}>RESALE HISTORY {ig.span}</Text>
              <Text style={styles.igLine}>
                {ig.priced} priced posts across the biggest IG resale shops — median $
                {ig.median_usd}
                {ig.recent_median_usd != null ? `, $${ig.recent_median_usd} in the last two years` : ''}
                , from ${ig.min_usd} to ${ig.max_usd}.
              </Text>
            </View>
          ) : null}

          {identified?.collector_notes ? (
            <Text style={styles.collectorNotes}>{identified.collector_notes}</Text>
          ) : null}

          <Pressable
            style={styles.scanButton}
            onPress={() =>
              router.push({
                pathname: '/add-shoe',
                params: {
                  mode: 'sell',
                  brand: displayBrand ?? '',
                  model: displayModel ?? '',
                  colorway: identified?.colorway ?? '',
                },
              })
            }
          >
            <Text style={styles.scanButtonText}>List it for sale</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={reset}>
            <Text style={styles.secondaryButtonText}>Scan another pair</Text>
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.bodySemi, color: colors.accent, fontSize: 11, letterSpacing: 1.5 },
  heading: { ...typography.brand, color: colors.navy, fontSize: 28, marginTop: 4 },
  sub: { ...typography.body, color: colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 19 },
  photoRow: { flexDirection: 'row', gap: 10, marginTop: 18, flexWrap: 'wrap' },
  photoWrap: { position: 'relative' },
  photo: { width: 96, height: 96, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.navy,
    borderRadius: 999,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: colors.white, fontSize: 13, lineHeight: 16 },
  photoAdd: {
    width: 96,
    height: 96,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  photoAddText: { color: colors.accent, fontSize: 22 },
  photoAddLabel: { ...typography.bodySemi, color: colors.textMuted, fontSize: 11, marginTop: 2 },
  libraryLink: { marginTop: 10, minHeight: 30, justifyContent: 'center' },
  libraryLinkText: { ...typography.bodySemi, color: colors.accent, fontSize: 13 },
  hint: { ...typography.body, color: colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  scanButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  scanButtonDisabled: { opacity: 0.45 },
  scanButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 15 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { ...typography.bodySemi, color: colors.text, fontSize: 14 },
  resultCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginTop: 18,
  },
  resultKicker: { ...typography.bodySemi, color: colors.accent, fontSize: 10, letterSpacing: 1.2 },
  resultTitle: { ...typography.brand, color: colors.navy, fontSize: 22, marginTop: 4 },
  resultMeta: { ...typography.body, color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(184,157,96,0.12)',
  },
  chipText: { ...typography.bodySemi, color: colors.accentHover, fontSize: 10, letterSpacing: 0.6 },
  resultNote: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 10, lineHeight: 17 },
  valueCard: {
    backgroundColor: colors.navy,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
  },
  valueBig: { ...typography.brand, color: colors.accentLight, fontSize: 34, marginTop: 4 },
  valueRange: { ...typography.bodySemi, color: colors.white, fontSize: 13, marginTop: 2 },
  valueNote: { ...typography.body, color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 10, lineHeight: 17 },
  sourceLine: { ...typography.bodySemi, color: colors.accentLight, fontSize: 11, marginTop: 10 },
  igCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
  },
  igLine: { ...typography.body, color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 19 },
  collectorNotes: { ...typography.body, color: colors.textSecondary, fontSize: 12, marginTop: 12, lineHeight: 18 },
  error: { ...typography.body, color: colors.danger, marginTop: 12 },
});
