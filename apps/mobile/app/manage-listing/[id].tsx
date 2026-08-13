import { useEffect, useState } from 'react';
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
type ListingImage = {
  id: string;
  public_url: string;
  clean_public_url?: string | null;
  use_clean?: boolean | null;
  display_order?: number | null;
};
type Listing = {
  id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  colorway?: string | null;
  size?: number | null;
  condition?: string | null;
  wear_state?: string | null;
  description?: string | null;
  listing_type: string;
  status: string;
  price_cents?: number | null;
  accepts_offers?: boolean | null;
  open_to_trade?: boolean | null;
  market_listing_images?: ListingImage[] | null;
};

function normalizedType(value: string): ListingType {
  if (value === 'sell') return 'sell';
  if (value === 'trade' || value === 'trade_only') return 'trade';
  return 'collection';
}

function normalizedWearState(value?: string | null): WearState {
  if (value === 'bnib' || value === 'new_no_box') return value;
  return 'used';
}

function imageUrl(image: ListingImage) {
  return image.use_clean && image.clean_public_url
    ? image.clean_public_url
    : image.public_url || image.clean_public_url || '';
}

export default function ManageListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [listingType, setListingType] = useState<ListingType>('collection');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [colorway, setColorway] = useState('');
  const [size, setSize] = useState('');
  const [wearState, setWearState] = useState<WearState>('used');
  const [condition, setCondition] = useState('good');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [acceptsOffers, setAcceptsOffers] = useState(true);
  const [openToTrade, setOpenToTrade] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadListing();
  }, [id]);

  async function loadListing() {
    setError(null);
    try {
      const result = await apiFetch<{ listing: Listing; viewer?: { isSeller?: boolean } }>(`/api/market/listings/${id}`);
      if (!result.viewer?.isSeller) throw new Error('Only the owner can manage this listing.');
      const next = result.listing;
      setListing(next);
      setListingType(normalizedType(next.listing_type));
      setBrand(next.brand ?? '');
      setModel(next.model ?? '');
      setColorway(next.colorway ?? '');
      setSize(next.size != null ? String(next.size) : '');
      setWearState(normalizedWearState(next.wear_state));
      setCondition(next.condition ?? 'good');
      setDescription(next.description ?? '');
      setPrice(next.price_cents != null ? String(next.price_cents / 100) : '');
      setAcceptsOffers(next.accepts_offers !== false);
      setOpenToTrade(next.open_to_trade === true);
      setImages([...(next.market_listing_images ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load listing');
    }
  }

  async function uploadAssets(assets: ImagePicker.ImagePickerAsset[]) {
    const available = Math.max(0, 6 - images.length);
    if (!available) {
      setError('A listing can have up to 6 photos.');
      return;
    }
    setPhotoBusy(true);
    setError(null);
    try {
      const added: ListingImage[] = [];
      for (const [index, asset] of assets.slice(0, available).entries()) {
        if (!asset.base64) throw new Error('Could not read that photo. Please select it again.');
        const result = await apiFetch<{ image?: ListingImage }>(`/api/market/listings/${id}/images`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: asset.fileName || `shoe-${images.length + index + 1}.jpg`,
            mimeType: asset.mimeType || 'image/jpeg',
            base64: asset.base64,
          }),
        });
        if (result.image) added.push(result.image);
      }
      setImages((current) => [...current, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function takePhoto() {
    if (images.length >= 6) return setError('A listing can have up to 6 photos.');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return setError('Camera access is required to take photos.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.82, base64: true });
    if (!result.canceled) await uploadAssets(result.assets);
  }

  async function pickPhotos() {
    if (images.length >= 6) return setError('A listing can have up to 6 photos.');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError('Photo access is required to add photos.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 6 - images.length),
      quality: 0.82,
      base64: true,
    });
    if (!result.canceled) await uploadAssets(result.assets);
  }

  async function makeCover(image: ListingImage) {
    if (images[0]?.id === image.id || photoBusy) return;
    setPhotoBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/market/listings/${id}/images/${image.id}/primary`, { method: 'POST' });
      setImages((current) => [image, ...current.filter((item) => item.id !== image.id)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change cover photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function cleanPhoto(image: ListingImage) {
    if (photoBusy) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ success?: boolean; cleanUrl?: string; error?: string }>(`/api/market/listings/${id}/images/${image.id}/clean`, { method: 'POST' });
      if (!result.success || !result.cleanUrl) throw new Error(result.error || 'Could not clean background');
      setImages((current) => current.map((item) => item.id === image.id ? { ...item, clean_public_url: result.cleanUrl, use_clean: true } : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clean background');
    } finally {
      setPhotoBusy(false);
    }
  }

  function confirmRemovePhoto(image: ListingImage) {
    Alert.alert('Remove photo?', 'This photo will be removed from the listing.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void (async () => {
          setPhotoBusy(true);
          setError(null);
          try {
            await apiFetch(`/api/market/listings/${id}/images/${image.id}`, { method: 'DELETE' });
            setImages((current) => current.filter((item) => item.id !== image.id));
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not remove photo');
          } finally {
            setPhotoBusy(false);
          }
        })(),
      },
    ]);
  }

  function confirmDelete() {
    if (saving) return;
    Alert.alert('Delete this pair?', 'This removes the listing and its photos from Guild Market. This cannot be undone.', [
      { text: 'Keep pair', style: 'cancel' },
      { text: 'Delete pair', style: 'destructive', onPress: () => void deleteListing() },
    ]);
  }

  async function deleteListing() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/market/listings/${id}`, { method: 'DELETE' });
      Alert.alert('Pair deleted', 'The listing was removed from your Market.', [
        { text: 'Done', onPress: () => router.replace('/my-market') },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this listing');
    } finally {
      setSaving(false);
    }
  }

  async function save(nextStatus?: 'active' | 'archived') {
    if (!listing || saving) return;
    const numericSize = Number(size);
    const numericPrice = Number(price);
    if (!brand.trim() || !model.trim()) return setError('Enter the brand and model.');
    if (!Number.isFinite(numericSize) || numericSize <= 0) return setError('Enter a valid shoe size.');
    if (listingType === 'sell' && (!Number.isFinite(numericPrice) || numericPrice <= 0)) return setError('Enter a valid sale price.');
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/market/listings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: `${brand.trim()} ${model.trim()}`,
          brand: brand.trim(),
          model: model.trim(),
          colorway: colorway.trim() || null,
          size: numericSize,
          wear_state: wearState,
          condition: wearState === 'used' ? condition : wearState === 'bnib' ? 'new_in_box' : 'new',
          description: description.trim() || null,
          listing_type: listingType,
          price_cents: listingType === 'sell' ? Math.round(numericPrice * 100) : null,
          open_to_trade: listingType === 'trade' || openToTrade,
          accepts_offers: listingType !== 'trade' ? acceptsOffers : true,
          ...(nextStatus ? { status: nextStatus } : {}),
        }),
      });
      Alert.alert('Listing updated', nextStatus === 'archived' ? 'The listing is archived.' : 'All changes are live.', [
        { text: 'View listing', onPress: () => router.replace(`/listing/${id}`) },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update listing');
    } finally {
      setSaving(false);
    }
  }

  if (!listing && !error) return <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.kicker}>MY MARKET</Text>
      <Text style={styles.heading}>Edit shoe</Text>
      <Text style={styles.title}>Update anything buyers see.</Text>

      <Text style={styles.label}>PHOTOS · {images.length}/6</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
        {images.map((image, index) => (
          <View key={image.id} style={styles.photoCard}>
            <Image source={{ uri: imageUrl(image) }} style={styles.photo} resizeMode="contain" />
            {index === 0 ? <Text style={styles.coverBadge}>COVER</Text> : null}
            <View style={styles.photoActions}>
              {index !== 0 ? <Pressable onPress={() => void makeCover(image)}><Text style={styles.photoAction}>Cover</Text></Pressable> : null}
              {!image.clean_public_url ? <Pressable onPress={() => void cleanPhoto(image)}><Text style={styles.photoAction}>Clean</Text></Pressable> : null}
              <Pressable onPress={() => confirmRemovePhoto(image)}><Text style={styles.removeAction}>Remove</Text></Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.addPhotoRow}>
        <Pressable style={styles.photoButton} onPress={() => void takePhoto()} disabled={photoBusy || images.length >= 6}>
          <Text style={styles.photoButtonText}>Take photo</Text>
        </Pressable>
        <Pressable style={styles.photoButton} onPress={() => void pickPhotos()} disabled={photoBusy || images.length >= 6}>
          <Text style={styles.photoButtonText}>Add from library</Text>
        </Pressable>
      </View>
      {photoBusy ? <ActivityIndicator style={{ marginTop: 10 }} color={colors.accent} /> : null}

      <Text style={styles.label}>SHOE DETAILS</Text>
      <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="Nike" />
      <Field label="Model" value={model} onChangeText={setModel} placeholder="Tawa" />
      <Field label="Colorway" value={colorway} onChangeText={setColorway} placeholder="Black / Gold" />
      <Field label="Size" value={size} onChangeText={setSize} placeholder="10" keyboardType="decimal-pad" />

      <Text style={styles.label}>CONDITION</Text>
      <View style={styles.choices}>
        {([['bnib', 'New in box'], ['new_no_box', 'New'], ['used', 'Used']] as [WearState, string][]).map(([value, label]) => (
          <Pressable key={value} style={[styles.choice, wearState === value && styles.choiceSelected]} onPress={() => setWearState(value)}>
            <Text style={[styles.choiceText, wearState === value && styles.choiceTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {wearState === 'used' ? <Field label="Condition details" value={condition} onChangeText={setCondition} placeholder="Good" /> : null}

      <Text style={styles.label}>DESCRIPTION</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Describe the pair, fit, condition, history, and anything a buyer should know."
        placeholderTextColor={colors.textSecondary}
        style={styles.description}
      />

      <Text style={styles.label}>LISTING MODE</Text>
      <View style={styles.choices}>
        {([['collection', 'Collection'], ['sell', 'For sale'], ['trade', 'Trade']] as [ListingType, string][]).map(([value, label]) => (
          <Pressable key={value} style={[styles.choice, listingType === value && styles.choiceSelected]} onPress={() => setListingType(value)}>
            <Text style={[styles.choiceText, listingType === value && styles.choiceTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {listingType === 'sell' ? (
        <>
          <Field label="Price" value={price} onChangeText={setPrice} placeholder="75" keyboardType="decimal-pad" prefix="$" />
          <Toggle title="Accept offers" meta="Let members bid below ask." on={acceptsOffers} onPress={() => setAcceptsOffers((value) => !value)} />
          <Toggle title="Also open to trade" meta="Show this pair to members browsing trades." on={openToTrade} onPress={() => setOpenToTrade((value) => !value)} />
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.save, (saving || photoBusy) && styles.disabled]} onPress={() => void save(listing?.status === 'draft' || listing?.status === 'archived' ? 'active' : undefined)} disabled={saving || photoBusy || !listing}>
        {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveText}>{listing?.status === 'draft' || listing?.status === 'archived' ? 'Publish listing' : 'Save all changes'}</Text>}
      </Pressable>
      {listing?.status === 'active' ? <Pressable style={styles.archive} onPress={() => void save('archived')} disabled={saving}><Text style={styles.archiveText}>Archive listing</Text></Pressable> : null}
      <Pressable style={styles.deleteRow} onPress={confirmDelete} disabled={saving || !listing}><Text style={styles.deleteText}>Delete pair</Text></Pressable>
    </ScrollView>
  );
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'decimal-pad'; prefix?: string }) {
  const { label, prefix, ...inputProps } = props;
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.field}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput {...inputProps} style={styles.input} placeholderTextColor={colors.textSecondary} />
      </View>
    </View>
  );
}

function Toggle({ title, meta, on, onPress }: { title: string; meta: string; on: boolean; onPress: () => void }) {
  return <Pressable style={styles.toggleRow} onPress={onPress}><View style={[styles.toggleDot, on && styles.toggleDotOn]} /><View style={{ flex: 1 }}><Text style={styles.toggleTitle}>{title}</Text><Text style={styles.toggleMeta}>{meta}</Text></View></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 56 },
  kicker: { ...typography.brand, color: colors.accent, fontSize: 10, marginBottom: 8 },
  heading: { ...typography.display, color: colors.text, fontSize: 28 },
  title: { ...typography.body, color: colors.textMuted, fontSize: 13, marginTop: 7 },
  label: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 9, letterSpacing: 1, marginTop: 24, marginBottom: 10 },
  photos: { gap: 10, paddingRight: 8 },
  photoCard: { width: 180, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface },
  photo: { width: 180, height: 180, backgroundColor: colors.surfaceRaised },
  coverBadge: { position: 'absolute', top: 9, left: 9, ...typography.bodyBold, fontSize: 8, color: colors.black, backgroundColor: colors.accent, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999 },
  photoActions: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 5 },
  photoAction: { ...typography.bodySemi, color: colors.accent, fontSize: 10 },
  removeAction: { ...typography.bodySemi, color: colors.danger, fontSize: 10 },
  addPhotoRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  photoButton: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.accent, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  photoButtonText: { ...typography.bodySemi, color: colors.accent, fontSize: 12 },
  fieldBlock: { marginTop: 11 },
  fieldLabel: { ...typography.bodySemi, color: colors.textMuted, fontSize: 10, marginBottom: 6 },
  field: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 12 },
  prefix: { ...typography.bodySemi, color: colors.accent, fontSize: 17 },
  input: { ...typography.bodySemi, flex: 1, color: colors.text, fontSize: 15, paddingHorizontal: 7, minHeight: 48 },
  description: { ...typography.body, color: colors.text, minHeight: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.surface, padding: 13, fontSize: 13, lineHeight: 19, textAlignVertical: 'top' },
  choices: { flexDirection: 'row', gap: 7 },
  choice: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  choiceSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { ...typography.bodySemi, color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  choiceTextSelected: { color: colors.black },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginTop: 12 },
  toggleDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  toggleDotOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  toggleTitle: { ...typography.bodyBold, color: colors.text, fontSize: 13 },
  toggleMeta: { ...typography.body, color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  error: { ...typography.body, color: colors.danger, fontSize: 12, marginTop: 15 },
  save: { minHeight: 54, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  saveText: { ...typography.bodyBold, color: colors.black, fontSize: 14 },
  archive: { minHeight: 50, borderRadius: 9, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  archiveText: { ...typography.bodySemi, color: colors.danger, fontSize: 13 },
  deleteRow: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  deleteText: { ...typography.bodySemi, color: colors.danger, fontSize: 13 },
  disabled: { opacity: 0.5 },
});
