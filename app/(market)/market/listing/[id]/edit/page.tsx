'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackLink } from '@/components/back-link';
import { SELLER_AI_DISCLAIMER } from '@/lib/market/ai/prompts';
import { buildListingAgentPrompt, buildListingDescription } from '@/lib/market/listing-description';
import { sanitizeBuyerListingDescription } from '@/lib/market/sanitize-listing-description';
import {
  WEAR_STATE_OPTIONS,
  USED_CONDITIONS,
  conditionForWearState,
  type MarketWearState,
} from '@/lib/market/wear-state';
import {
  SELLER_LISTING_TYPE_OPTIONS,
  type MarketListingType,
} from '@/lib/market/listing-type-options';
import { ListingPhotoGrid } from '@/components/market/listing-photo-grid';
import { ShoeIdCard, type ShoeIdAcceptPayload } from '@/components/market/shoe-id-card';
import {
  BROWSE_COLOR_FAMILIES,
  inferColorFamilyFromColorway,
  parseColorFamily,
} from '@/lib/market/color-family';
import { shoeIdClientEnabled } from '@/lib/market/shoe-id/feature-flag';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';
import { MARKET_BRANDS, normalizeMarketBrand } from '@/lib/market/brands';
import { MarketBrandSelect } from '@/components/market/market-brand-select';
import { ListingRarityField } from '@/components/market/listing-rarity-field';
import { normalizeMarketRarity, type MarketRarity } from '@/lib/market/rarity';
import {
  CollectionPurchaseNotesFields,
  collectionPurchaseNotesFromListing,
  collectionPurchaseNotesToPayload,
  emptyCollectionPurchaseNotes,
  type CollectionPurchaseNotes,
} from '@/components/market/collection-purchase-notes';
import {
  ListingTypeQuickActions,
  type ListingTypePatch,
} from '@/components/market/listing-type-quick-actions';
import {
  fetchListingImagesForClient,
  normalizeListingImagesForClient,
  listingImagesFromApiRow,
  type MarketListingImageRow,
} from '@/lib/market/listing-images';
import { prepareListingPhotos } from '@/lib/market/prepare-listing-photo';
import { cn } from '@/lib/utils';
import {
  BnibSizeInventoryEditor,
  emptySizeInventoryRow,
  UsedListingSizeNote,
  type SizeInventoryRow,
} from '@/components/market/bnib-size-inventory-editor';
import { supportsMultiSizeInventory, formatMarketShoeSizeFieldLabel } from '@/lib/market/listing-sizes';

const MAX_PHOTOS = 6;

type ListingImage = MarketListingImageRow & { id: string };

const EDITABLE_STATUSES = new Set(['active', 'draft', 'archived']);

export default function EditListingPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('active');
  const [images, setImages] = useState<ListingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifyingShoe, setIdentifyingShoe] = useState(false);
  const [shoeIdResult, setShoeIdResult] = useState<ShoeIdResult | null>(null);
  const [shoeIdUserOverride, setShoeIdUserOverride] = useState(true);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentReply, setAgentReply] = useState<string | null>(null);
  const [agentInput, setAgentInput] = useState('');
  const [agentExpanded, setAgentExpanded] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [purchaseNotes, setPurchaseNotes] = useState<CollectionPurchaseNotes>(
    emptyCollectionPurchaseNotes()
  );
  const [modeBlockedReason, setModeBlockedReason] = useState<string | null>(null);
  const [activeTradeId, setActiveTradeId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [brandOptions, setBrandOptions] = useState<string[]>([...MARKET_BRANDS]);
  const [sizeInventory, setSizeInventory] = useState<SizeInventoryRow[]>([
    emptySizeInventoryRow('10'),
  ]);

  const shoeIdUserLocked = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUploadLock = useRef(false);

  const [form, setForm] = useState({
    brand: 'Adidas',
    model: '',
    colorway: '',
    color_family: '',
    model_year: '',
    size: '10',
    wear_state: 'used' as MarketWearState,
    condition: 'good',
    listing_type: 'collection' as MarketListingType,
    open_to_trade: false,
    price_cents: '',
    shipping_cents: '10',
    description: '',
    rarity: '' as MarketRarity | '',
  });

  useEffect(() => {
    void (async () => {
      try {
        const [res, brandsRes] = await Promise.all([
          fetch(`/api/market/listings/${listingId}`),
          fetch('/api/market/brands'),
        ]);
        const data = await res.json();
        const brandsData = await brandsRes.json();
        if (brandsRes.ok && Array.isArray(brandsData.sellerBrands)) {
          setBrandOptions(brandsData.sellerBrands as string[]);
        }
        if (!res.ok) throw new Error(data.error || 'Failed to load listing');
        if (!data.viewer?.isSeller) {
          setLoadError('You can only edit your own listings.');
          return;
        }

        const l = data.listing as Record<string, unknown>;
        const listingStatus = (l.status as string) || 'active';
        if (!EDITABLE_STATUSES.has(listingStatus)) {
          setLoadError('Sold and traded listings cannot be edited.');
          return;
        }

        setStatus(listingStatus);
        setModeBlockedReason(
          data.viewer?.can_change_mode === false ? data.viewer.mode_blocked_reason ?? null : null
        );
        setActiveTradeId(data.viewer?.active_trade_id ?? null);
        setIsAdmin(Boolean(data.viewer?.isAdmin));
        const imgs = listingImagesFromApiRow(l);
        setImages(imgs);

        const wear = (l.wear_state as MarketWearState) || 'used';
        const sellerBrands = (brandsRes.ok && Array.isArray(brandsData.sellerBrands)
          ? (brandsData.sellerBrands as string[])
          : [...MARKET_BRANDS]) as string[];
        const listingBrand = String(l.brand ?? 'Adidas');
        const resolvedBrand =
          sellerBrands.find((b) => b.toLowerCase() === listingBrand.trim().toLowerCase()) ??
          listingBrand;
        setForm({
          brand: resolvedBrand,
          model: String(l.model ?? ''),
          colorway: String(l.colorway ?? ''),
          color_family: String(l.color_family ?? ''),
          model_year: l.model_year ? String(l.model_year) : '',
          size: String(l.size ?? '10'),
          wear_state: wear,
          condition: String(l.condition ?? 'good'),
          listing_type: (l.listing_type as MarketListingType) || 'collection',
          open_to_trade: Boolean(l.open_to_trade),
          price_cents:
            l.price_cents != null ? String(Math.round(Number(l.price_cents) / 100)) : '',
          shipping_cents:
            l.shipping_cents != null ? String(Math.round(Number(l.shipping_cents) / 100)) : '10',
          description: String(l.description ?? ''),
          rarity: normalizeMarketRarity(l.rarity as string | null) ?? '',
        });
        setPurchaseNotes(collectionPurchaseNotesFromListing(l));
        const loadedSizes = (data.sizes as { size_us: number; quantity: number }[] | undefined) ?? [];
        if (loadedSizes.length) {
          setSizeInventory(
            loadedSizes.map((row) => ({
              size_us: String(row.size_us),
              quantity: String(row.quantity),
            }))
          );
        } else if (supportsMultiSizeInventory(wear)) {
          setSizeInventory([emptySizeInventoryRow(String(l.size ?? '10'))]);
        }
        if (String(l.description ?? '').trim()) {
          setDescriptionTouched(true);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load listing');
      } finally {
        setLoading(false);
      }
    })();
  }, [listingId]);

  const isUsed = form.wear_state === 'used';
  const isBnibInventory = supportsMultiSizeInventory(form.wear_state);
  const isPricedListing = form.listing_type === 'sell';
  const isCollection = form.listing_type === 'collection';

  const updateImage = (imageId: string, patch: Partial<MarketListingImageRow>) => {
    setImages((prev) => prev.map((img) => (img.id === imageId ? { ...img, ...patch } : img)));
  };

  const lockShoeIdentity = useCallback(() => {
    shoeIdUserLocked.current = true;
    setShoeIdUserOverride(true);
  }, []);

  const applyShoeIdPayload = useCallback(
    (payload: ShoeIdAcceptPayload, opts?: { colorwayOnly?: boolean }): Partial<typeof form> => {
      const cw = payload.colorway?.trim() || '';
      if (opts?.colorwayOnly || shoeIdUserLocked.current) {
        return {
          colorway: cw,
          color_family: inferColorFamilyFromColorway(cw) || '',
        };
      }
      return {
        brand: normalizeMarketBrand(payload.brand),
        model: payload.model?.trim() || '',
        colorway: cw,
        color_family: inferColorFamilyFromColorway(cw) || '',
      };
    },
    []
  );

  const resolveColorFamily = (colorFamily: string, colorway: string) =>
    parseColorFamily(colorFamily) ?? inferColorFamilyFromColorway(colorway.trim() || null);

  const savePayload = () => {
    const colorway = form.colorway.trim();
    return {
      title: `${form.brand} ${form.model}`.trim(),
      brand: form.brand,
      model: form.model,
      colorway: colorway || null,
      color_family: resolveColorFamily(form.color_family, colorway),
      model_year: form.model_year ? Number(form.model_year) : null,
      size: Number(form.size),
      wear_state: form.wear_state,
      condition: conditionForWearState(form.wear_state, form.condition),
      listing_type: form.listing_type,
      open_to_trade: form.listing_type === 'sell' ? form.open_to_trade : false,
      description: form.description,
      price_cents:
        form.listing_type === 'sell'
          ? Math.round(Number(form.price_cents || 0) * 100)
          : null,
      shipping_cents:
        form.listing_type === 'collection' || form.listing_type === 'vault'
          ? 0
          : Math.round(Number(form.shipping_cents || 0) * 100),
      rarity: form.rarity || null,
      ...collectionPurchaseNotesToPayload(purchaseNotes),
    };
  };

  const descriptionInput = () => ({
    brand: form.brand,
    model: form.model,
    colorway: form.colorway.trim() || null,
    modelYear: form.model_year ? Number(form.model_year) : null,
    size: Number(form.size) || 10,
    wearState: form.wear_state,
    condition: conditionForWearState(form.wear_state, form.condition),
    analysis: null,
  });

  const generateDescription = async (sellerNote?: string) => {
    if (!form.model.trim()) {
      setError('Add a model before generating a description.');
      return;
    }
    setAgentLoading(true);
    setAgentReply(null);
    setError(null);
    try {
      const res = await fetch('/api/market/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: listingId,
          messages: [
            {
              role: 'user',
              content: buildListingAgentPrompt({
                brand: form.brand,
                model: form.model,
                colorway: form.colorway,
                modelYear: form.model_year ? Number(form.model_year) : null,
                size: Number(form.size) || 10,
                wearState: form.wear_state,
                condition: conditionForWearState(form.wear_state, form.condition),
                listingType: form.listing_type,
                sellerNote,
                conditionAnalysis: null,
              }),
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Description failed');
      if (data.has_draft && data.draft?.description) {
        const clean = sanitizeBuyerListingDescription(data.draft.description);
        setForm((f) => ({ ...f, description: clean }));
        setDescriptionTouched(false);
        setAgentInput('');
      } else if (data.message) {
        setAgentReply(data.message);
      } else {
        setError('Could not generate description — try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Description failed');
    } finally {
      setAgentLoading(false);
    }
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? []);
    if (!rawFiles.length) return;
    if (photoUploadLock.current) return;
    photoUploadLock.current = true;
    setUploadError(null);
    setUploading(true);
    try {
      setUploadProgress('Preparing photos…');
      const { files, prepareErrors } = await prepareListingPhotos(rawFiles);

      if (!files.length) {
        throw new Error(prepareErrors[0] || 'Could not read these photos — try again or use JPEG/PNG.');
      }

      let serverCount = (await fetchListingImagesForClient(listingId)).length;
      const uploadErrors: string[] = [...prepareErrors];

      for (let i = 0; i < files.length; i++) {
        if (serverCount >= MAX_PHOTOS) {
          setUploadError(`Maximum ${MAX_PHOTOS} photos per listing.`);
          break;
        }
        setUploadProgress(`Uploading ${i + 1} of ${files.length}…`);
        const fd = new FormData();
        fd.append('file', files[i]);
        const res = await fetch(`/api/market/listings/${listingId}/images`, {
          method: 'POST',
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          uploadErrors.push(data.error || `Photo ${i + 1} failed to upload`);
          continue;
        }
        if (data.image) {
          serverCount += 1;
        }
      }

      const refreshed = await normalizeListingImagesForClient(listingId);
      setImages(refreshed);

      if (!refreshed.length && uploadErrors.length) {
        throw new Error(uploadErrors[0] || 'Upload failed');
      }
      if (uploadErrors.length) {
        setUploadError(
          `${uploadErrors.length} photo(s) failed — ${uploadErrors[0]}. Others were saved.`
        );
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      try {
        const refreshed = await fetchListingImagesForClient(listingId);
        setImages(refreshed);
      } catch {
        // Keep local state if refresh fails
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      photoUploadLock.current = false;
      e.target.value = '';
    }
  };

  const removePhoto = async (imageId: string) => {
    setUploadError(null);
    try {
      const res = await fetch(`/api/market/listings/${listingId}/images/${imageId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not remove photo');
      await fetchListingImagesForClient(listingId).then(setImages);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not remove photo');
    }
  };

  const runShoeId = async () => {
    if (!shoeIdClientEnabled() || !images.length) return;
    setIdentifyingShoe(true);
    try {
      const res = await fetch('/api/market/shoe-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          images: images.map((i) => i.public_url),
          brandHint: form.brand.trim() || undefined,
          modelHint: form.model.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setShoeIdResult(data.result as ShoeIdResult);
        const overrides = applyShoeIdPayload(
          {
            brand: form.brand,
            model: form.model,
            colorway: data.result.colorway,
          },
          { colorwayOnly: shoeIdUserLocked.current }
        );
        setForm((f) => ({ ...f, ...overrides }));
        if (data.result.rarity) {
          setForm((f) => ({ ...f, rarity: data.result.rarity }));
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setIdentifyingShoe(false);
    }
  };

  const save = async () => {
    setError(null);
    const expectedPhotoCount = images.length;
    if (status === 'active' && expectedPhotoCount === 0) {
      setError('Add at least one photo before saving.');
      return;
    }
    setSaving(true);
    try {
      const savedImages = await normalizeListingImagesForClient(listingId);
      setImages(savedImages);
      if (status === 'active' && savedImages.length === 0) {
        setError('Add at least one photo before saving.');
        return;
      }
      if (expectedPhotoCount > 0 && savedImages.length < expectedPhotoCount) {
        setError(
          `Only ${savedImages.length} of ${expectedPhotoCount} photos saved. Re-add missing photos before saving.`
        );
        return;
      }

      const description =
        form.description.trim() || buildListingDescription(descriptionInput());
      const res = await fetch(`/api/market/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...savePayload(),
          description,
          status: status === 'draft' ? 'active' : status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      if (supportsMultiSizeInventory(form.wear_state)) {
        const sizesRes = await fetch(`/api/market/listings/${listingId}/sizes`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sizes: sizeInventory.map((row) => ({
              size_us: row.size_us,
              quantity: row.quantity,
            })),
          }),
        });
        const sizesData = await sizesRes.json();
        if (!sizesRes.ok) throw new Error(sizesData.error || 'Failed to save sizes');
      }

      if (!form.rarity) {
        const rarityRes = await fetch('/api/market/ai/rarity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId, persist: true }),
        });
        await rarityRes.json().catch(() => ({}));
      }

      router.replace(`/market/listing/${listingId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setListingType = (listingType: MarketListingType) => {
    if (modeBlockedReason && listingType !== form.listing_type) return;
    setForm((f) => ({
      ...f,
      listing_type: listingType,
      open_to_trade: listingType === 'sell' ? f.open_to_trade : false,
      price_cents: listingType === 'sell' ? f.price_cents : '',
      shipping_cents:
        listingType === 'collection' || listingType === 'vault' ? '0' : f.shipping_cents,
    }));
  };

  if (loading) {
    return (
      <div className="px-4 py-8 max-w-lg mx-auto">
        <p className="text-muted-foreground">Loading listing…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-4 py-8 max-w-lg mx-auto space-y-4">
        <BackLink fallbackHref="/market/my-listings" label="My pairs" />
        <p className="text-destructive">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref={`/market/listing/${listingId}`} label="Back to listing" />

      <div>
        <h1 className="text-2xl font-bold">Edit listing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fix brand, model, photos, and description — your changes save to this listing.
        </p>
      </div>

      <ListingTypeQuickActions
        listingId={listingId}
        currentType={form.listing_type}
        currentPriceCents={
          form.price_cents ? Math.round(Number(form.price_cents) * 100) : null
        }
        compact
        modeBlockedReason={modeBlockedReason}
        activeTradeId={activeTradeId}
        onUpdated={(patch: ListingTypePatch) => {
          setForm((f) => ({
            ...f,
            listing_type: patch.listing_type,
            price_cents:
              patch.price_cents != null ? String(Math.round(patch.price_cents / 100)) : '',
            shipping_cents:
              patch.shipping_cents != null
                ? String(Math.round(patch.shipping_cents / 100))
                : patch.listing_type === 'collection' || patch.listing_type === 'vault'
                  ? '0'
                  : f.shipping_cents,
            open_to_trade: patch.listing_type === 'sell' ? f.open_to_trade : false,
          }));
          setModeBlockedReason(null);
          setActiveTradeId(null);
        }}
      />

      <div className="grid gap-4">
        <div>
          <Label>Brand</Label>
          <MarketBrandSelect
            className={cn(
              'w-full mt-1 rounded-md border bg-background px-3 py-2',
              shoeIdUserOverride ? 'border-amber-500/50' : 'border-input'
            )}
            value={form.brand}
            brands={brandOptions}
            isAdmin={isAdmin}
            onBrandAdded={(_brand, brands) => setBrandOptions(brands)}
            onChange={(brand) => {
              lockShoeIdentity();
              setForm({ ...form, brand, rarity: '' });
            }}
          />
        </div>
        <div>
          <Label>Model</Label>
          <Input
            value={form.model}
            onChange={(e) => {
              lockShoeIdentity();
              setForm({ ...form, model: e.target.value, rarity: '' });
            }}
            placeholder="Inflict 3"
          />
        </div>
        <ListingRarityField
          rarity={form.rarity}
          isAdmin={isAdmin}
          onChange={(rarity) => setForm((f) => ({ ...f, rarity }))}
        />
        <div>
          <Label>Colorway (optional)</Label>
          <Input
            value={form.colorway}
            onChange={(e) => setForm({ ...form, colorway: e.target.value, rarity: '' })}
            onBlur={() => {
              setForm((f) => {
                if (f.color_family) return f;
                const inferred = inferColorFamilyFromColorway(f.colorway.trim());
                return inferred ? { ...f, color_family: inferred } : f;
              });
            }}
            placeholder="Blue bird, Black/Gold"
          />
        </div>
        <div>
          <Label>Color</Label>
          <select
            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
            value={form.color_family}
            onChange={(e) => setForm({ ...form, color_family: e.target.value })}
          >
            <option value="">Auto from colorway</option>
            {BROWSE_COLOR_FAMILIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Model year</Label>
            <Input
              value={form.model_year}
              onChange={(e) =>
                setForm({ ...form, model_year: e.target.value.replace(/\D/g, '').slice(0, 4) })
              }
              placeholder="2016"
            />
          </div>
          {!isBnibInventory ? (
            <div>
              <Label>{formatMarketShoeSizeFieldLabel()}</Label>
              <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
              <UsedListingSizeNote className="mt-1.5" />
            </div>
          ) : null}
        </div>
        {isBnibInventory ? (
          <BnibSizeInventoryEditor rows={sizeInventory} onChange={setSizeInventory} />
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Photos</Label>
          <span className="text-xs text-muted-foreground">
            {images.length}/{MAX_PHOTOS}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          multiple
          className="hidden"
          onChange={onPhoto}
          disabled={uploading || images.length >= MAX_PHOTOS}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || images.length >= MAX_PHOTOS}
          className="w-full rounded-xl border border-dashed py-6 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-accent hover:text-accent transition-colors"
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">{uploadProgress ?? 'Uploading…'}</span>
            </>
          ) : (
            <>
              <Plus className="h-5 w-5" />
              <span className="text-sm">Add photos</span>
            </>
          )}
        </button>
        {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
        {images.length > 0 ? (
          <ListingPhotoGrid
            listingId={listingId}
            images={images}
            onImagesChange={setImages}
            onUpdateImage={updateImage}
            onRemove={(imageId) => void removePhoto(imageId)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No photos — add at least one.</p>
        )}

        {shoeIdClientEnabled() && images.length > 0 ? (
          <ShoeIdCard
            listingId={listingId}
            images={images}
            externalResult={shoeIdResult}
            externalLoading={identifyingShoe}
            userLocked={shoeIdUserOverride}
            formBrand={form.brand}
            formModel={form.model}
            onAccept={(payload, opts) => {
              setForm((f) => ({ ...f, ...applyShoeIdPayload(payload, opts) }));
            }}
          />
        ) : null}

        {images.length > 0 && identifyingShoe ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Identifying shoe…
          </div>
        ) : null}

        {shoeIdClientEnabled() && images.length > 0 && !shoeIdResult && !identifyingShoe ? (
          <button
            type="button"
            onClick={() => void runShoeId()}
            className="text-xs text-accent hover:text-accent/80"
          >
            Re-run shoe ID for colorway
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <Label>Condition</Label>
        <div className="space-y-2">
          {WEAR_STATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  wear_state: opt.value,
                  condition:
                    opt.value === 'used' ? (f.condition === 'new' ? 'good' : f.condition) : 'new',
                }))
              }
              className={cn(
                'w-full text-left rounded-lg border px-3 py-3 transition-colors',
                form.wear_state === opt.value
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/40'
              )}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
            </button>
          ))}
        </div>
        {isUsed ? (
          <div>
            <Label>Used condition</Label>
            <select
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
            >
              {USED_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <Label>Listing type</Label>
        <div className="space-y-2">
          {SELLER_LISTING_TYPE_OPTIONS.map((opt) => {
            const isCurrent = form.listing_type === opt.value;
            const disabled = Boolean(modeBlockedReason) && !isCurrent;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => setListingType(opt.value)}
                className={cn(
                  'w-full text-left rounded-lg border px-3 py-3 transition-colors',
                  isCurrent
                    ? 'border-accent bg-accent/10'
                    : disabled
                      ? 'border-border/50 opacity-50 cursor-not-allowed'
                      : 'border-border hover:border-accent/40'
                )}
              >
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
              </button>
            );
          })}
        </div>
        {modeBlockedReason ? (
          <p className="text-xs text-muted-foreground">
            {modeBlockedReason}
            {activeTradeId ? (
              <>
                {' '}
                <Link href={`/market/trade/${activeTradeId}`} className="text-accent hover:underline">
                  View trade
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {isCollection ? (
          <p className="text-xs text-muted-foreground">
            Collection pairs show on your profile — not for sale until you move them to Offers.
          </p>
        ) : null}
      </div>

      <CollectionPurchaseNotesFields notes={purchaseNotes} onChange={setPurchaseNotes} />

      {isPricedListing ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Price ($)</Label>
            <Input
              value={form.price_cents}
              onChange={(e) => setForm({ ...form, price_cents: e.target.value })}
            />
          </div>
          <div>
            <Label>Shipping ($)</Label>
            <Input
              value={form.shipping_cents}
              onChange={(e) => setForm({ ...form, shipping_cents: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-2">
          <Label>Description</Label>
          <button
            type="button"
            onClick={() => void generateDescription()}
            disabled={agentLoading || !form.model.trim()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {agentLoading ? 'Writing…' : 'Generate with AI'}
          </button>
        </div>
        <textarea
          className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
          value={form.description}
          onChange={(e) => {
            setDescriptionTouched(true);
            setForm({ ...form, description: e.target.value });
          }}
          placeholder="What buyers see — condition, fit, story behind the pair."
        />
        {agentReply ? <p className="text-xs text-muted-foreground mt-1">{agentReply}</p> : null}
        {agentExpanded ? (
          <div className="mt-2">
            <Input
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              placeholder="Optional note for AI"
              disabled={agentLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void generateDescription(agentInput.trim() || undefined);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAgentExpanded(true)}
            className="text-xs text-muted-foreground hover:text-foreground mt-1"
          >
            + Add a personal note for AI
          </button>
        )}
        {!descriptionTouched && !form.description.trim() ? (
          <p className="text-xs text-muted-foreground mt-1">
            Empty descriptions can be auto-filled from brand and model when you save.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            This is what buyers see on your listing.
          </p>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        className="w-full min-h-[48px] bg-accent text-accent-foreground font-semibold"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? 'Saving…' : status === 'draft' ? 'Save & publish' : 'Save changes'}
      </Button>

      <p className="text-xs text-muted-foreground">{SELLER_AI_DISCLAIMER}</p>
    </div>
  );
}
