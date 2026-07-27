import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { apiFetch } from '@/lib/api';
import { colors, typography } from '@/lib/theme';

type VideoAsset = ImagePicker.ImagePickerAsset;

const CATEGORIES = [
  ['coaching', 'Coaching'],
  ['facilities', 'Getting mat space'],
  ['session_ideas', 'Session ideas'],
  ['parent_communication', 'Parents'],
  ['business', 'Business'],
  ['recruiting', 'Recruiting'],
  ['other', 'Other'],
] as const;

function VideoPreview({ asset }: { asset: VideoAsset }) {
  const player = useVideoPlayer(asset.uri);
  return <VideoView player={player} style={styles.preview} nativeControls contentFit="contain" />;
}

export default function CoachPlaybookAddScreen() {
  const router = useRouter();
  const [asset, setAsset] = useState<VideoAsset | null>(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState('coaching');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function acceptVideo(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) return;
    const selected = result.assets[0];
    const durationMs = selected.duration ?? 0;
    if (durationMs <= 0) {
      setError('We could not read the video length. Choose a different video.');
      return;
    }
    if (durationMs > 60_500) {
      setError('Keep Coach Playbook videos to 60 seconds or less.');
      return;
    }
    setError(null);
    setAsset(selected);
  }

  async function record() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera access is required to record a coach tip.');
      return;
    }
    acceptVideo(await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 60,
      quality: 0.7,
    }));
  }

  async function choose() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is required to choose a video.');
      return;
    }
    acceptVideo(await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 60,
      quality: 0.7,
    }));
  }

  async function publish() {
    if (!asset) {
      setError('Record or choose a video first.');
      return;
    }
    if (!title.trim()) {
      setError('Add a short title so coaches know what they will learn.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('caption', caption.trim());
      form.append('category', category);
      form.append('durationSeconds', String(Math.max(1, Math.ceil((asset.duration ?? 1000) / 1000))));
      form.append('video', {
        uri: asset.uri,
        name: asset.fileName || `coach-tip-${Date.now()}.mov`,
        type: asset.mimeType || 'video/quicktime',
      } as unknown as Blob);
      await apiFetch('/api/coach-playbook/posts', { method: 'POST', body: form });
      router.replace('/coach-playbook');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish video');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topNav}>
        <Pressable
          style={styles.topNavButton}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/coach-playbook');
          }}
        >
          <Text style={styles.topNavText}>‹ Coach Playbook</Text>
        </Pressable>
        <Pressable style={styles.topNavButton} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.topNavText}>Coach home</Text>
        </Pressable>
      </View>
      <Text style={styles.kicker}>COACHES ONLY</Text>
      <Text style={styles.heading}>Share what works.</Text>
      <Text style={styles.sub}>
        One useful idea, explained in 60 seconds or less. Keep it practical and appropriate for every Guild coach.
      </Text>

      <View style={styles.pickerRow}>
        <Pressable style={styles.primary} onPress={() => void record()} disabled={busy}>
          <Text style={styles.primaryText}>Record video</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => void choose()} disabled={busy}>
          <Text style={styles.secondaryText}>Choose video</Text>
        </Pressable>
      </View>
      {asset ? (
        <>
          <VideoPreview asset={asset} />
          <Text style={styles.duration}>{Math.ceil((asset.duration ?? 0) / 1000)} seconds</Text>
        </>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>No video selected</Text>
          <Text style={styles.placeholderText}>Selfie video is perfect. Landscape or portrait both work.</Text>
        </View>
      )}

      <Text style={styles.label}>What will coaches learn?</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        maxLength={100}
        placeholder="Example: How I get access to local wrestling rooms"
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.label}>Category</Text>
      <View style={styles.categories}>
        {CATEGORIES.map(([value, name]) => (
          <Pressable
            key={value}
            style={[styles.category, category === value && styles.categorySelected]}
            onPress={() => setCategory(value)}
          >
            <Text style={[styles.categoryText, category === value && styles.categoryTextSelected]}>{name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Optional context</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={caption}
        onChangeText={setCaption}
        maxLength={500}
        multiline
        placeholder="Add one or two details coaches should know."
        placeholderTextColor={colors.textMuted}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.publish, busy && styles.disabled]} onPress={() => void publish()} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.black} /> : <Text style={styles.publishText}>Publish to Coach Playbook</Text>}
      </Pressable>
      <Text style={styles.privateNote}>Only verified Guild coaches and admins can view these videos.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 56 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  topNavButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 2 },
  topNavText: { ...typography.bodyBold, color: colors.accent, fontSize: 13 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 11 },
  heading: { ...typography.display, color: colors.text, fontSize: 32, marginTop: 6 },
  sub: { ...typography.body, color: colors.textSecondary, lineHeight: 21, marginTop: 7 },
  pickerRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primary: { flex: 1, minHeight: 48, borderRadius: 4, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  primaryText: { ...typography.bodyBold, color: colors.black },
  secondary: { flex: 1, minHeight: 48, borderRadius: 4, borderWidth: 1, borderColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
  secondaryText: { ...typography.bodyBold, color: colors.accent },
  preview: { width: '100%', aspectRatio: 9 / 12, backgroundColor: colors.black, marginTop: 14, borderRadius: 5 },
  duration: { ...typography.bodySemi, color: colors.accent, fontSize: 12, marginTop: 6, textAlign: 'right' },
  placeholder: { minHeight: 180, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, marginTop: 14, alignItems: 'center', justifyContent: 'center', padding: 24 },
  placeholderTitle: { ...typography.bodyBold, color: colors.text },
  placeholderText: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: 5 },
  label: { ...typography.bodyBold, color: colors.text, marginTop: 18, marginBottom: 7 },
  input: { ...typography.body, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 5, minHeight: 50, paddingHorizontal: 13, paddingVertical: 12 },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  categorySelected: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  categoryText: { ...typography.bodySemi, color: colors.textSecondary, fontSize: 12 },
  categoryTextSelected: { color: colors.accent },
  error: { ...typography.body, color: colors.danger, marginTop: 14 },
  publish: { minHeight: 52, borderRadius: 4, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  disabled: { opacity: 0.55 },
  publishText: { ...typography.bodyBold, color: colors.black },
  privateNote: { ...typography.body, color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 10 },
});
