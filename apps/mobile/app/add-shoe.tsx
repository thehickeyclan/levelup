import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { marketColors as colors, typography } from '@/lib/theme';

type ListingType = 'collection' | 'sell' | 'trade';
type WearState = 'bnib' | 'new_no_box' | 'used';
type PickedPhoto = { uri: string; fileName?: string | null; mimeType?: string | null; base64?: string | null };
type ListingImageResponse = {
  image?: {
    id: string;
    public_url?: string | null;
    clean_public_url?: string | null;
    use_clean?: boolean | null;
  };
};
type PriceResponse = {
  price?: {
    suggested_mid_cents?: number;
    confidence_note?: string;
  };
};
type ConditionResponse = {
  analysis?: {
    grade?: string;
  };
  suggested_description?: string;
  warning?: string;
};
type AgentResponse = {
  has_draft?: boolean;
  message?: string;
  draft?: {
    description?: string;
    colorway?: string;
  };
};

export default function AddShoeScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [listingType, setListingType] = useState<ListingType>('collection');
  const [wearState, setWearState] = useState<WearState>('used');
  const [acceptsOffers, setAcceptsOffers] = useState(true);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [colorway, setColorway] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState('good');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [draftListingId, setDraftListingId] = useState<string | null>(null);
  const [uploadedPhotoCount, setUploadedPhotoCount] = useState(0);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'sell' || mode === 'trade' || mode === 'collection') {
      setListingType(mode);
    }
  }, [mode]);

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
      base64: true,
    });
    if (!result.canceled) {
      if (draftListingId) {
        setAiMessage('Photos changed. Run AI refresh again if you want updated guidance before publishing.');
      }
      setPhotos((current) => [
        ...current,
        ...result.assets.slice(0, 6 - current.length).map((asset) => ({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          base64: asset.base64,
        })),
      ]);
    }
  }

  function listingPayload(status?: 'active') {
    const numericSize = Number(size);
    const numericPrice = Number(price);
    return {
      draft: status !== 'active',
      status,
      title: `${brand.trim()} ${model.trim()}`.trim() || 'Wrestling sneakers',
      brand: brand.trim(),
      model: model.trim(),
      colorway: colorway.trim() || null,
      size: Number.isFinite(numericSize) && numericSize > 0 ? numericSize : 10,
      condition,
      wear_state: wearState,
      listing_type: listingType,
      price_cents:
        listingType === 'sell' && Number.isFinite(numericPrice) && numericPrice > 0
          ? Math.round(numericPrice * 100)
          : null,
      open_to_trade: listingType === 'trade',
      accepts_offers: listingType !== 'trade' ? acceptsOffers : true,
      description: description.trim() || undefined,
    };
  }

  async function ensureDraftWithPhotos() {
    if (!brand.trim() || !model.trim() || !size.trim()) {
      throw new Error('Enter brand, model, and size first — then AI can refresh from the corrected details.');
    }
    if (photos.length === 0) {
      throw new Error('Add at least one photo before AI refresh.');
    }

    let listingId = draftListingId;
    if (!listingId) {
      const created = await apiFetch<{ listingId: string }>('/api/market/listings', {
        method: 'POST',
        body: JSON.stringify(listingPayload()),
      });
      listingId = created.listingId;
      setDraftListingId(listingId);
    } else {
      await apiFetch(`/api/market/listings/${listingId}`, {
        method: 'PATCH',
        body: JSON.stringify(listingPayload()),
      });
    }

    const urls = [...uploadedImageUrls];
    for (let index = uploadedPhotoCount; index < photos.length; index += 1) {
      const photo = photos[index];
      if (!photo.base64) {
        throw new Error('Could not read one of the photos. Please pick it again from your camera roll.');
      }
      const uploaded = await apiFetch<ListingImageResponse>(`/api/market/listings/${listingId}/images`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: photo.fileName || `shoe-${index + 1}.jpg`,
          mimeType: photo.mimeType || 'image/jpeg',
          base64: photo.base64,
        }),
      });
      const imageUrl = uploaded.image?.use_clean
        ? uploaded.image.clean_public_url || uploaded.image.public_url
        : uploaded.image?.public_url || uploaded.image?.clean_public_url;
      if (imageUrl) urls.push(imageUrl);
    }

    setUploadedPhotoCount(photos.length);
    setUploadedImageUrls(urls);
    return { listingId };
  }

  async function refreshAiFromCurrentDetails() {
    if (aiRefreshing || saving) return;
    setAiRefreshing(true);
    setError(null);
    setAiMessage(null);
    try {
      const { listingId } = await ensureDraftWithPhotos();

      const catalog = await apiFetch<{
        found?: boolean;
        model_year?: number | null;
        colorway?: string | null;
      }>('/api/market/catalog/lookup', {
        method: 'POST',
        body: JSON.stringify({
          listingId,
          brand: brand.trim(),
          model: model.trim(),
          colorway: colorway.trim() || undefined,
          persist: true,
        }),
      });

      const conditionResult = await apiFetch<ConditionResponse>('/api/market/ai/condition', {
        method: 'POST',
        body: JSON.stringify({ listingId, wear_state: wearState }),
      });
      const nextCondition = conditionResult.analysis?.grade || condition;
      if (conditionResult.analysis?.grade) {
        setCondition(conditionResult.analysis.grade);
      }
      if (!description.trim() && conditionResult.suggested_description) {
        setDescription(conditionResult.suggested_description);
      }

      let priceNote = '';
      if (listingType === 'sell') {
        const priceResult = await apiFetch<PriceResponse>('/api/market/ai/price', {
          method: 'POST',
          body: JSON.stringify({
            listingId,
            brand: brand.trim(),
            model: model.trim(),
            size: Number(size),
            condition: nextCondition,
            listing_type: listingType,
            description: description.trim(),
            wear_state: wearState,
            model_year: catalog.model_year ?? null,
            colorway: colorway.trim() || catalog.colorway || undefined,
          }),
        });
        const mid = priceResult.price?.suggested_mid_cents;
        if (typeof mid === 'number' && mid > 0) {
          const dollars = Math.round(mid / 100);
          setPrice(String(dollars));
          priceNote = ` Suggested price: $${dollars}.`;
        }
      }

      let descriptionNote = '';
      try {
        const agentResult = await apiFetch<AgentResponse>('/api/market/ai/agent', {
          method: 'POST',
          body: JSON.stringify({
            draftId: listingId,
            messages: [
              {
                role: 'user',
                content: [
                  'Write the buyer-facing listing description/history for this wrestling shoe.',
                  `Brand: ${brand.trim()}`,
                  `Model: ${model.trim()}`,
                  colorway.trim() ? `Colorway: ${colorway.trim()}` : null,
                  `Size: ${size}`,
                  `Wear state: ${wearState}`,
                  `Condition: ${nextCondition}`,
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            ],
          }),
        });
        if (agentResult.draft?.colorway && !colorway.trim()) {
          setColorway(agentResult.draft.colorway);
        }
        if (agentResult.draft?.description && !description.trim()) {
          setDescription(agentResult.draft.description);
        }
      } catch {
        descriptionNote = ' Description/history did not refresh; you can try again.';
      }

      setAiMessage(
        `${catalog.found ? 'Catalog matched.' : 'No exact catalog match yet.'} AI refreshed condition, description, history, and value from your corrected brand/model/colorway.${priceNote}${
          conditionResult.warning ? ' Review condition before publishing.' : ''
        }${descriptionNote}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI refresh failed');
    } finally {
      setAiRefreshing(false);
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
      const { listingId } = await ensureDraftWithPhotos();

      await apiFetch(`/api/market/listings/${listingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...listingPayload('active'), status: 'active' }),
      });
      Alert.alert('Shoe added', 'Your shoe is now in My Market.', [
        { text: 'View listing', onPress: () => router.replace(`/listing/${listingId}`) },
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
      <Text style={styles.modeHelp}>
        {listingType === 'collection'
          ? 'Collection keeps it in your shoe room. Members can follow it and you can list it later.'
          : listingType === 'sell'
            ? 'Sell makes the pair visible for purchase and offers.'
            : 'Trade tells the Guild you are looking for swaps or trade + cash.'}
      </Text>

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
      <Field label="COLORWAY (OPTIONAL)" value={colorway} onChangeText={setColorway} placeholder="Black / gold, white / royal…" />
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
      <View style={styles.aiBox}>
        <Text style={styles.aiTitle}>AI listing assistant</Text>
        <Text style={styles.aiCopy}>
          Enter brand, model, and colorway first. AI writes the description/history, checks photo condition, and suggests price.
        </Text>
        <Pressable
          style={[styles.aiButton, (aiRefreshing || saving) && styles.disabled]}
          onPress={() => void refreshAiFromCurrentDetails()}
          disabled={aiRefreshing || saving}
        >
          {aiRefreshing ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <Text style={styles.aiButtonText}>Refresh AI from these details</Text>
          )}
        </Pressable>
        {aiMessage ? <Text style={styles.aiMessage}>{aiMessage}</Text> : null}
      </View>
      {listingType === 'sell' ? (
        <>
          <Field label="PRICE" value={price} onChangeText={setPrice} placeholder="75" keyboardType="decimal-pad" prefix="$" />
          <Pressable style={styles.toggleRow} onPress={() => setAcceptsOffers((value) => !value)}>
            <View style={[styles.toggleDot, acceptsOffers && styles.toggleDotOn]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Accept offers</Text>
              <Text style={styles.toggleMeta}>Let members make a lower bid or start a conversation.</Text>
            </View>
          </Pressable>
        </>
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
} & ComponentProps<typeof TextInput>) {
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
  modeHelp: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 10 },
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginTop: 12 },
  toggleDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  toggleDotOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  toggleTitle: { ...typography.bodyBold, color: colors.text, fontSize: 13 },
  toggleMeta: { ...typography.body, color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  aiBox: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, padding: 13, marginTop: 16 },
  aiTitle: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  aiCopy: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  aiButton: { minHeight: 45, backgroundColor: colors.accent, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  aiButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 13 },
  aiMessage: { ...typography.body, color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: 10 },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginTop: 14 },
  publish: { minHeight: 54, backgroundColor: colors.accent, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  publishText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  disabled: { opacity: 0.5 },
});
