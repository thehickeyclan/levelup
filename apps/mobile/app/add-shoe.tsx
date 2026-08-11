import { useEffect, useRef, useState } from 'react';
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
type AddShoeStep = 'photos' | 'confirm' | 'condition' | 'review';
type PickedPhoto = { uri: string; fileName?: string | null; mimeType?: string | null; base64?: string | null };

const MARKET_EBAY_STYLE_SELLER_FEE_RATE = 0.1325;
const MARKET_EBAY_DISCOUNT_TARGET = 0.2;
const MARKET_MAX_SELLER_FEE_RATE = MARKET_EBAY_STYLE_SELLER_FEE_RATE * (1 - MARKET_EBAY_DISCOUNT_TARGET);

function getMarketFeeRate(priceCents: number) {
  const rate =
    priceCents < 10000
      ? 0.1
      : priceCents < 20000
        ? 0.08
        : priceCents < 40000
          ? 0.07
          : 0.06;

  return Math.min(rate, MARKET_MAX_SELLER_FEE_RATE);
}

function calcMarketFees(priceCents: number) {
  const rate = getMarketFeeRate(priceCents);
  const feeCents = Math.round(priceCents * rate);
  return { feeCents, payoutCents: priceCents - feeCents, rate };
}

type ListingImageResponse = {
  image?: {
    id: string;
    public_url?: string | null;
    clean_public_url?: string | null;
    use_clean?: boolean | null;
  };
};
type UploadedListingImage = NonNullable<ListingImageResponse['image']>;
type CleanImageResponse = {
  success?: boolean;
  cleanUrl?: string;
  error?: string;
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
  const [step, setStep] = useState<AddShoeStep>('photos');
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
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [aiSellerNote, setAiSellerNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [draftListingId, setDraftListingId] = useState<string | null>(null);
  const [uploadedPhotoCount, setUploadedPhotoCount] = useState(0);
  const [uploadedImages, setUploadedImages] = useState<UploadedListingImage[]>([]);
  const [cleanBackground, setCleanBackground] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photosRef = useRef<PickedPhoto[]>([]);

  useEffect(() => {
    if (mode === 'sell' || mode === 'trade' || mode === 'collection') {
      setListingType(mode);
    }
  }, [mode]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  function isGenericDescription(text: string) {
    const value = text.trim().toLowerCase();
    if (!value) return true;
    if (value.length < 90) return true;
    return (
      value.includes('see photos') ||
      value === 'unworn in box' ||
      value.includes('unworn with original box') ||
      value.includes('unworn deadstock without box') ||
      value.includes('see photos for exact wear')
    );
  }

  function addPickedPhotos(assets: ImagePicker.ImagePickerAsset[]) {
    const currentCount = photosRef.current.length;
    const slotsRemaining = Math.max(0, 6 - currentCount);
    const nextAssets = assets.slice(0, slotsRemaining);
    const nextCount = Math.min(6, currentCount + nextAssets.length);
    if (draftListingId) {
      setAiMessage('Photos changed. Run AI refresh again if you want updated guidance before publishing.');
    }
    setPhotos((current) => {
      const nextPhotos = [
        ...current,
        ...nextAssets.map((asset) => ({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        base64: asset.base64,
      })),
      ];
      photosRef.current = nextPhotos;
      return nextPhotos;
    });
    setStep('confirm');
    return nextCount;
  }

  async function takePhoto(askForAnother = true) {
    if (photosRef.current.length >= 6) {
      setError('You can add up to 6 photos.');
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera access is required to take shoe photos.');
      return;
    }
    setError(null);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      base64: true,
    });
    if (!result.canceled) {
      const nextCount = addPickedPhotos(result.assets);
      if (askForAnother && nextCount < 6) {
        Alert.alert('Photo added', 'Take another angle?', [
          { text: 'Done', style: 'cancel' },
          { text: 'Take another', onPress: () => void takePhoto(true) },
        ]);
      }
    }
  }

  async function pickPhotos() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is required to add a shoe.');
      return;
    }
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 6 - photos.length),
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled) {
      addPickedPhotos(result.assets);
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

  function displayUrlForUploadedImage(image: UploadedListingImage) {
    return image.use_clean
      ? image.clean_public_url || image.public_url || ''
      : image.public_url || image.clean_public_url || '';
  }

  async function cleanUploadedImage(listingId: string, image: UploadedListingImage) {
    if (!cleanBackground || !image.id) return image;
    if (image.clean_public_url && image.use_clean) return image;
    const cleaned = await apiFetch<CleanImageResponse>(
      `/api/market/listings/${listingId}/images/${image.id}/clean`,
      { method: 'POST' }
    );
    if (!cleaned.success || !cleaned.cleanUrl) {
      throw new Error(cleaned.error || 'Clean background failed — try again or turn it off.');
    }
    return {
      ...image,
      clean_public_url: cleaned.cleanUrl,
      use_clean: true,
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

    const imageRows = [...uploadedImages];
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
      const image = uploaded.image ? await cleanUploadedImage(listingId, uploaded.image) : null;
      if (image) imageRows.push(image);
    }

    if (cleanBackground && imageRows.length) {
      for (let index = 0; index < imageRows.length; index += 1) {
        imageRows[index] = await cleanUploadedImage(listingId, imageRows[index]);
      }
    }

    setUploadedPhotoCount(photos.length);
    setUploadedImages(imageRows);
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
        body: JSON.stringify({
          listingId,
          wear_state: wearState,
          seller_note: aiSellerNote.trim() || undefined,
        }),
      });
      const nextCondition = conditionResult.analysis?.grade || condition;
      if (wearState === 'used' && conditionResult.analysis?.grade) {
        setCondition(conditionResult.analysis.grade);
      }
      const descriptionBeforeAi = description.trim();
      if (!descriptionBeforeAi && conditionResult.suggested_description) {
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
                  'Write one buyer-facing wrestling shoe listing paragraph, 60–100 words.',
                  'Do not write filler like "see photos" as the description. Include model context, on-mat use, fit/lockdown, traction/sole, and colorway look when known.',
                  'If exact history is uncertain, stay factual and restrained instead of inventing collector claims.',
                  `Brand: ${brand.trim()}`,
                  `Model: ${model.trim()}`,
                  colorway.trim() ? `Colorway: ${colorway.trim()}` : null,
                  `Size: ${size}`,
                  `Wear state: ${wearState}`,
                  `Condition: ${nextCondition}`,
                  aiSellerNote.trim() ? `Seller personal note: ${aiSellerNote.trim()}` : null,
                  'Return valid JSON with has_draft true and draft.description.',
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
        if (
          agentResult.draft?.description &&
          (!descriptionTouched || isGenericDescription(descriptionBeforeAi))
        ) {
          setDescription(agentResult.draft.description);
          setDescriptionTouched(false);
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

  function continueStep() {
    setError(null);
    if (step === 'photos') {
      if (photos.length === 0) {
        setError('Add at least one photo before continuing.');
        return;
      }
      setStep('confirm');
      return;
    }
    if (step === 'confirm') {
      if (!brand.trim() || !model.trim() || !size.trim()) {
        setError('Enter brand, model, and size.');
        return;
      }
      setStep('condition');
      return;
    }
    if (step === 'condition') {
      setStep('review');
    }
  }

  const steps: Array<{ key: AddShoeStep; label: string }> = [
    { key: 'photos', label: 'Photos' },
    { key: 'confirm', label: 'Confirm' },
    { key: 'condition', label: 'Value' },
    { key: 'review', label: 'Publish' },
  ];
  const stepIndex = steps.findIndex((item) => item.key === step);
  const highestStepIndex = !photos.length ? 0 : brand.trim() && model.trim() && size.trim() ? 3 : 1;
  const stepCopy =
    step === 'photos'
      ? 'Start with clear photos. Camera works best.'
      : step === 'confirm'
        ? 'Confirm brand, model, colorway, and size.'
        : step === 'condition'
          ? 'Set condition, then let AI draft history and value.'
          : 'Choose collection, sale, or trade and publish.';
  const nextLabel =
    step === 'photos'
      ? 'Confirm shoe'
      : step === 'confirm'
        ? 'Condition & value'
        : step === 'condition'
          ? 'Review listing'
          : '';
  const priceCents = Math.round(Number(price || 0) * 100);
  const sellerFeePreview =
    listingType === 'sell' && Number.isFinite(priceCents) && priceCents > 0
      ? calcMarketFees(priceCents)
      : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>MY MARKET</Text>
      <Text style={styles.heading}>
        {step === 'photos'
          ? 'Add photos'
          : step === 'confirm'
            ? 'Confirm shoe'
            : step === 'condition'
              ? 'Condition & value'
              : 'Review & publish'}
      </Text>
      <Text style={styles.sub}>{stepCopy}</Text>

      <View style={styles.stepNav}>
        {steps.map((item, index) => (
          <Pressable
            key={item.key}
            disabled={index > highestStepIndex}
            onPress={() => setStep(item.key)}
            style={[
              styles.stepPill,
              item.key === step && styles.stepPillActive,
              index > highestStepIndex && styles.stepPillDisabled,
            ]}
          >
            <Text style={[styles.stepPillText, item.key === step && styles.stepPillTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((stepIndex + 1) / steps.length) * 100}%` }]} />
      </View>

      {step === 'photos' ? (
        <>
          <Text style={styles.label}>PHOTOS · {photos.length}/6</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
            <Pressable style={styles.addPhoto} onPress={() => void takePhoto()}>
              <Text style={styles.addPhotoPlus}>📷</Text>
              <Text style={styles.addPhotoText}>Camera</Text>
            </Pressable>
            <Pressable style={styles.addPhotoSecondary} onPress={() => void pickPhotos()}>
              <Text style={styles.addPhotoPlus}>＋</Text>
              <Text style={styles.addPhotoText}>Library</Text>
            </Pressable>
            {photos.map((photo, index) => (
              <Pressable key={`${photo.uri}-${index}`} onPress={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <View style={styles.remove}><Text style={styles.removeText}>×</Text></View>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.cleanToggleRow} onPress={() => setCleanBackground((value) => !value)}>
            <View style={[styles.toggleDot, cleanBackground && styles.toggleDotOn]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Clean background</Text>
              <Text style={styles.toggleMeta}>Remove messy backgrounds after upload and use a clean white shoe photo.</Text>
            </View>
          </Pressable>
        </>
      ) : null}

      {step === 'confirm' ? (
        <>
          <Field label="BRAND" value={brand} onChangeText={setBrand} placeholder="Adidas, Nike, Rudis…" />
          <Field label="MODEL" value={model} onChangeText={setModel} placeholder="Combat Speed 4" />
          <Field label="COLORWAY (OPTIONAL)" value={colorway} onChangeText={setColorway} placeholder="Black / gold, white / royal…" />
          <Field label="SIZE" value={size} onChangeText={setSize} placeholder="10.5" keyboardType="decimal-pad" />
        </>
      ) : null}

      {step === 'condition' ? (
        <>
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
              AI uses your confirmed brand, model, colorway, photos, and condition to draft history and suggest value.
            </Text>
            <TextInput
              value={aiSellerNote}
              onChangeText={setAiSellerNote}
              placeholder="Personal note for AI — e.g. brand new, box not pictured"
              placeholderTextColor={colors.textSecondary}
              multiline
              style={[styles.input, styles.aiNoteInput]}
            />
            <Pressable
              style={[styles.aiButton, (aiRefreshing || saving) && styles.disabled]}
              onPress={() => void refreshAiFromCurrentDetails()}
              disabled={aiRefreshing || saving}
            >
              {aiRefreshing ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={styles.aiButtonText}>Refresh AI from confirmed details</Text>
              )}
            </Pressable>
            {aiMessage ? <Text style={styles.aiMessage}>{aiMessage}</Text> : null}
          </View>
          {listingType === 'sell' ? (
            <>
              <Field label="PRICE" value={price} onChangeText={setPrice} placeholder="75" keyboardType="decimal-pad" prefix="$" />
              <SellerFeePreview preview={sellerFeePreview} priceCents={priceCents} />
            </>
          ) : null}
        </>
      ) : null}

      {step === 'review' ? (
        <>
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
          {listingType === 'sell' ? (
            <>
              <Field label="PRICE" value={price} onChangeText={setPrice} placeholder="75" keyboardType="decimal-pad" prefix="$" />
              <SellerFeePreview preview={sellerFeePreview} priceCents={priceCents} />
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
            onChangeText={(value) => {
              setDescriptionTouched(true);
              setDescription(value);
            }}
            placeholder="Fit, wear, history, or anything a buyer should know"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[styles.input, styles.textarea]}
          />
        </>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {step === 'review' ? (
        <Pressable style={[styles.publish, saving && styles.disabled]} onPress={() => void publish()} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.publishText}>Add to My Market</Text>}
        </Pressable>
      ) : (
        <Pressable style={styles.publish} onPress={continueStep}>
          <Text style={styles.publishText}>{nextLabel}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function SellerFeePreview({
  preview,
  priceCents,
}: {
  preview: ReturnType<typeof calcMarketFees> | null;
  priceCents: number;
}) {
  if (!preview) return null;

  const ebayBenchmarkFeeCents = Math.round(priceCents * MARKET_EBAY_STYLE_SELLER_FEE_RATE);
  const sellerKeepsMoreCents = Math.max(0, ebayBenchmarkFeeCents - preview.feeCents);

  return (
    <View style={styles.feeBox}>
      <View style={styles.feeRow}>
        <Text style={styles.feeTitle}>Seller receives</Text>
        <Text style={styles.feeAmount}>${(preview.payoutCents / 100).toFixed(2)}</Text>
      </View>
      <Text style={styles.feeCopy}>
        Guild fee {(preview.rate * 100).toFixed(0)}% · at least {Math.round(MARKET_EBAY_DISCOUNT_TARGET * 100)}%
        cheaper than an eBay-style {(MARKET_EBAY_STYLE_SELLER_FEE_RATE * 100).toFixed(1)}% marketplace fee. You
        keep about ${(sellerKeepsMoreCents / 100).toFixed(2)} more vs. that benchmark.
      </Text>
    </View>
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
  stepNav: { flexDirection: 'row', gap: 6, marginTop: 16 },
  stepPill: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  stepPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepPillDisabled: { opacity: 0.45 },
  stepPillText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 10 },
  stepPillTextActive: { color: colors.black },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 999 },
  label: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 9, letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  choices: { flexDirection: 'row', gap: 7 },
  choice: { flex: 1, minHeight: 45, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  choiceSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 11 },
  choiceTextSelected: { color: colors.black },
  modeHelp: { ...typography.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  photoRow: { gap: 9 },
  addPhoto: { width: 98, height: 98, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addPhotoSecondary: { width: 98, height: 98, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
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
  feeBox: {
    borderWidth: 1,
    borderColor: colors.accentLight,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  feeTitle: { ...typography.bodySemi, color: colors.text, fontSize: 13 },
  feeAmount: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  feeCopy: { ...typography.body, color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  aiNoteInput: { minHeight: 74, paddingTop: 10, textAlignVertical: 'top', marginTop: 10, marginBottom: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginTop: 12 },
  cleanToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginTop: 12 },
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
