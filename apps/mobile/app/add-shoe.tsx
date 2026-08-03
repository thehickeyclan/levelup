import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type ListingType = 'collection' | 'sell' | 'trade';
type WearState = 'bnib' | 'new_no_box' | 'used';
type PickedPhoto = { uri: string; fileName?: string | null; mimeType?: string | null };

export default function AddShoeScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [listingType, setListingType] = useState<ListingType>('collection');
  const [wearState, setWearState] = useState<WearState>('used');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState('good');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickPhotos() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is required to add a shoe.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 6 - photos.length),
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotos((current) => [
        ...current,
        ...result.assets.slice(0, 6 - current.length).map((asset) => ({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        })),
      ]);
    }
  }

  async function publish() {
    if (saving) return;
    if (!brand.trim() || !model.trim() || !size.trim()) {
      setError('Enter the brand, model, and size.');
      return;
    }
    if (photos.length === 0) {
      setError('Add at least one photo.');
      return;
    }
    const numericSize = Number(size);
    const numericPrice = Number(price);
    if (!Number.isFinite(numericSize) || numericSize <= 0) {
      setError('Enter a valid shoe size.');
      return;
    }
    if (listingType === 'sell' && (!Number.isFinite(numericPrice) || numericPrice <= 0)) {
      setError('Enter a sale price.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ listingId: string }>('/api/market/listings', {
        method: 'POST',
        body: JSON.stringify({
          draft: true,
          title: `${brand.trim()} ${model.trim()}`,
          brand: brand.trim(),
          model: model.trim(),
          size: numericSize,
          condition,
          wear_state: wearState,
          listing_type: listingType,
          price_cents: listingType === 'sell' ? Math.round(numericPrice * 100) : null,
          open_to_trade: listingType === 'trade',
          description: description.trim() || undefined,
        }),
      });

      for (const [index, photo] of photos.entries()) {
        const form = new FormData();
        form.append('file', {
          uri: photo.uri,
          name: photo.fileName || `shoe-${index + 1}.jpg`,
          type: photo.mimeType || 'image/jpeg',
        } as unknown as Blob);
        await apiFetch(`/api/market/listings/${created.listingId}/images`, {
          method: 'POST',
          body: form,
        });
      }

      await apiFetch(`/api/market/listings/${created.listingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      Alert.alert('Shoe added', 'Your shoe is now in My Market.', [
        { text: 'View listing', onPress: () => router.replace(`/listing/${created.listingId}`) },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add shoe');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>MY MARKET</Text>
      <Text style={styles.heading}>Add a shoe</Text>
      <Text style={styles.sub}>Start in your collection, list it for sale, or make it available for trade.</Text>

      <Text style={styles.label}>WHAT DO YOU WANT TO DO?</Text>
      <View style={styles.choices}>
        {([
          ['collection', 'Collect'],
          ['sell', 'Sell'],
          ['trade', 'Trade'],
        ] as [ListingType, string][]).map(([value, label]) => (
          <Pressable key={value} style={[styles.choice, listingType === value && styles.choiceSelected]} onPress={() => setListingType(value)}>
            <Text style={[styles.choiceText, listingType === value && styles.choiceTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>PHOTOS · {photos.length}/6</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
        <Pressable style={styles.addPhoto} onPress={() => void pickPhotos()}>
          <Text style={styles.addPhotoPlus}>+</Text>
          <Text style={styles.addPhotoText}>Add photos</Text>
        </Pressable>
        {photos.map((photo, index) => (
          <Pressable key={`${photo.uri}-${index}`} onPress={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}>
            <Image source={{ uri: photo.uri }} style={styles.photo} />
            <View style={styles.remove}><Text style={styles.removeText}>×</Text></View>
          </Pressable>
        ))}
      </ScrollView>

      <Field label="BRAND" value={brand} onChangeText={setBrand} placeholder="Adidas, Nike, Rudis…" />
      <Field label="MODEL" value={model} onChangeText={setModel} placeholder="Combat Speed 4" />
      <Field label="SIZE" value={size} onChangeText={setSize} placeholder="10.5" keyboardType="decimal-pad" />

      <Text style={styles.label}>CONDITION</Text>
      <View style={styles.choices}>
        {([
          ['bnib', 'New in box'],
          ['new_no_box', 'New'],
          ['used', 'Used'],
        ] as [WearState, string][]).map(([value, label]) => (
          <Pressable key={value} style={[styles.choice, wearState === value && styles.choiceSelected]} onPress={() => setWearState(value)}>
            <Text style={[styles.choiceText, wearState === value && styles.choiceTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {wearState === 'used' ? (
        <Field label="CONDITION NOTES" value={condition} onChangeText={setCondition} placeholder="Good" />
      ) : null}
      {listingType === 'sell' ? (
        <Field label="PRICE" value={price} onChangeText={setPrice} placeholder="75" keyboardType="decimal-pad" prefix="$" />
      ) : null}
      <Text style={styles.label}>DESCRIPTION (OPTIONAL)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Fit, wear, history, or anything a buyer should know"
        placeholderTextColor={colors.textSecondary}
        multiline
        style={[styles.input, styles.textarea]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.publish, saving && styles.disabled]} onPress={() => void publish()} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.publishText}>Add to My Market</Text>}
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  prefix,
  ...props
}: {
  label: string;
  prefix?: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.field}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput {...props} placeholderTextColor={colors.textSecondary} style={styles.fieldInput} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 29 },
  sub: { ...typography.body, color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  label: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 9, letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  choices: { flexDirection: 'row', gap: 7 },
  choice: { flex: 1, minHeight: 45, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  choiceSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 11 },
  choiceTextSelected: { color: colors.black },
  photoRow: { gap: 9 },
  addPhoto: { width: 98, height: 98, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addPhotoPlus: { ...typography.body, color: colors.accent, fontSize: 27 },
  addPhotoText: { ...typography.bodySemi, color: colors.accent, fontSize: 10 },
  photo: { width: 98, height: 98, borderRadius: 10, backgroundColor: colors.surface, resizeMode: 'cover' },
  remove: { position: 'absolute', right: 5, top: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.white, fontSize: 17, lineHeight: 19 },
  field: { minHeight: 49, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 12 },
  prefix: { ...typography.bodySemi, color: colors.accent, fontSize: 16 },
  fieldInput: { ...typography.body, flex: 1, color: colors.text, fontSize: 14, paddingHorizontal: 6 },
  input: { ...typography.body, minHeight: 49, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12 },
  textarea: { height: 94, paddingTop: 12, textAlignVertical: 'top' },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginTop: 14 },
  publish: { minHeight: 54, backgroundColor: colors.accent, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  publishText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  disabled: { opacity: 0.5 },
});
