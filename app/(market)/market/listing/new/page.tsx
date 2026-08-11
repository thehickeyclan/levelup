'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackLink } from '@/components/back-link';
import { SELLER_AI_DISCLAIMER } from '@/lib/market/ai/prompts';
import { buildListingDescription, buildListingAgentPrompt, resolveListingDescriptionForSave } from '@/lib/market/listing-description';
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
import { ShoeIdCard } from '@/components/market/shoe-id-card';
import {
  inferColorFamilyFromColorway,
  parseColorFamily,
} from '@/lib/market/color-family';
import { SimilarSalesGuidance, priceGuidanceFooter } from '@/components/market/similar-sales-guidance';
import {
  type ListingEnrichment,
  enrichmentFromShoeIdResult,
} from '@/lib/market/catalog-listing-enrich';
import {
  conditionGradeFromAnalysis,
  enrichmentToFormPatch,
} from '@/lib/market/listing-enrichment-form';
import { shouldAutoConfirmIdentity } from '@/lib/market/catalog-from-listing';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';
import { identifyListingShoe } from '@/lib/market/identify-listing-shoe';
import { MARKET_BRANDS, normalizeMarketBrand } from '@/lib/market/brands';
import { MarketBrandSelect } from '@/components/market/market-brand-select';
import { ListingRarityField } from '@/components/market/listing-rarity-field';
import { normalizeMarketRarity, type MarketRarity } from '@/lib/market/rarity';
import type { PriceComp } from '@/lib/market/ai/schemas';
import {
  fetchListingImagesForClient,
  normalizeListingImagesForClient,
  type MarketListingImageRow,
} from '@/lib/market/listing-images';
import { prepareListingPhotos } from '@/lib/market/prepare-listing-photo';
import { createListingDraftEnsurer } from '@/lib/market/ensure-listing-draft';
import {
  CollectionPurchaseNotesFields,
  collectionPurchaseNotesToPayload,
  emptyCollectionPurchaseNotes,
  type CollectionPurchaseNotes,
} from '@/components/market/collection-purchase-notes';
import { cn } from '@/lib/utils';
import {
  BnibSizeInventoryEditor,
  emptySizeInventoryRow,
  UsedListingSizeNote,
  type SizeInventoryRow,
} from '@/components/market/bnib-size-inventory-editor';
import { supportsMultiSizeInventory, formatMarketShoeSizeFieldLabel } from '@/lib/market/listing-sizes';
import { ShoeSizeSelect } from '@/components/market/shoe-size-select';

const MAX_PHOTOS = 6;
const BREAKDOWN_KEYS = ['sole', 'upper', 'midsole', 'laces'] as const;

type ListingImage = MarketListingImageRow & { id: string };

type BreakdownPart = { score: number; note: string };

type AiCondition = {
  wrestle_score: number;
  grade: string;
  breakdown: Partial<Record<(typeof BREAKDOWN_KEYS)[number], BreakdownPart>>;
  listing_tip?: string;
};

type AiPrice = {
  suggested_low_cents: number;
  suggested_mid_cents: number;
  suggested_high_cents: number;
  confidence_note: string;
  comps: PriceComp[];
};

type SellerWizardStep = 'photos' | 'confirm' | 'condition' | 'review';

const SELLER_WIZARD_STEPS: Array<{
  key: SellerWizardStep;
  label: string;
  title: string;
}> = [
  { key: 'photos', label: 'Photos', title: 'Add photos' },
  { key: 'confirm', label: 'Confirm', title: 'Confirm the shoe' },
  { key: 'condition', label: 'Value', title: 'Condition & value' },
  { key: 'review', label: 'Publish', title: 'Review & publish' },
];

function visionDisagreesWithForm(
  result: ShoeIdResult,
  current: { brand: string; model: string }
): boolean {
  const visionBrand = normalizeMarketBrand(result.brand);
  const formBrand = normalizeMarketBrand(current.brand);
  const visionModel = result.model.trim().toLowerCase();
  const formModel = current.model.trim().toLowerCase();
  return Boolean(
    (formBrand && visionBrand !== formBrand) ||
      (formModel && visionModel !== formModel)
  );
}

function gradeDisplay(grade: string) {
  return grade.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function AiSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <Sparkles className="h-4 w-4 text-accent animate-pulse" />
      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
      <span>{label}</span>
    </div>
  );
}

export default function NewListingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get('type');
  const initialListingType: MarketListingType =
    typeParam === 'vault' || typeParam === 'collection'
      ? 'collection'
      : typeParam === 'trade' || typeParam === 'sell'
        ? typeParam
        : 'sell';

  const [listingId, setListingId] = useState<string | null>(null);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [identifyingShoe, setIdentifyingShoe] = useState(false);
  const [catalogEnriching, setCatalogEnriching] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<
    'idle' | 'identifying' | 'catalog' | 'condition' | 'rarity' | 'price' | 'description'
  >('idle');
  const [shoeIdResult, setShoeIdResult] = useState<ShoeIdResult | null>(null);
  const [shoeIdAutoApplied, setShoeIdAutoApplied] = useState(false);
  /** User verified brand + model — unlock catalog lookup, condition, description. */
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  /** User manually edited brand/model — vision must not overwrite identity. */
  const [shoeIdentityLocked, setShoeIdentityLocked] = useState(false);
  const [catalogCollectorNotes, setCatalogCollectorNotes] = useState<string | null>(null);
  const [catalogUpperMaterial, setCatalogUpperMaterial] = useState<string | null>(null);
  const [catalogSoleDescription, setCatalogSoleDescription] = useState<string | null>(null);
  const [pricing, setPricing] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identitySavedFlash, setIdentitySavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiPipelineError, setAiPipelineError] = useState<string | null>(null);
  const [aiCondition, setAiCondition] = useState<AiCondition | null>(null);
  const [aiPrice, setAiPrice] = useState<AiPrice | null>(null);
  const [conditionOverridden, setConditionOverridden] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [aiDescriptionDraft, setAiDescriptionDraft] = useState(false);

  const [agentExpanded, setAgentExpanded] = useState(false);
  const [agentInput, setAgentInput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentReply, setAgentReply] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<SellerWizardStep>('photos');

  const [purchaseNotes, setPurchaseNotes] = useState<CollectionPurchaseNotes>(
    emptyCollectionPurchaseNotes()
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [brandOptions, setBrandOptions] = useState<string[]>([...MARKET_BRANDS]);
  const [sizeInventory, setSizeInventory] = useState<SizeInventoryRow[]>([
    emptySizeInventoryRow('10'),
  ]);

  const lastAutoKey = useRef<string | null>(null);
  const pipelineRunning = useRef(false);
  const lastCatalogEnrichKey = useRef<string | null>(null);
  const descriptionAutoKey = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUploadLock = useRef(false);
  const descriptionTouchedRef = useRef(false);
  const descriptionEditedDuringAgentRef = useRef(false);
  const photosDirtyRef = useRef(false);

  const [form, setForm] = useState({
    title: '',
    brand: 'Adidas',
    model: '',
    colorway: '',
    color_family: '',
    model_year: '',
    size: '10',
    wear_state: 'used' as MarketWearState,
    condition: 'good',
    listing_type: initialListingType,
    open_to_trade: false,
    accepts_offers:
      initialListingType === 'collection' || initialListingType === 'sell',
    price_cents: '',
    shipping_cents: '10',
    description: '',
    collector_notes: '',
    rarity: '' as MarketRarity | '',
    weight_class: '',
  });

  const listingIdRef = useRef<string | null>(null);
  listingIdRef.current = listingId;
  const formRef = useRef(form);
  formRef.current = form;

  const ensureListingDraft = useRef(
    createListingDraftEnsurer({
      getListingId: () => listingIdRef.current,
      setListingId: (id) => {
        listingIdRef.current = id;
        setListingId(id);
      },
      createDraft: async () => {
        const f = formRef.current;
        const res = await fetch('/api/market/listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: true,
            listing_type: f.listing_type,
            wear_state: f.wear_state,
            brand: f.brand,
            model: f.model.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create draft');
        return data.listingId as string;
      },
    })
  ).current;

  const sellerPrefillDone = useRef(false);

  useEffect(() => {
    descriptionTouchedRef.current = descriptionTouched;
  }, [descriptionTouched]);

  useEffect(() => {
    if (sellerPrefillDone.current) return;
    sellerPrefillDone.current = true;
    void (async () => {
      try {
        const [hintsRes, brandsRes] = await Promise.all([
          fetch('/api/market/seller-shoe-hints'),
          fetch('/api/market/brands'),
        ]);
        const hintsData = await hintsRes.json();
        const brandsData = await brandsRes.json();
        if (hintsRes.ok) setIsAdmin(Boolean(hintsData.isAdmin));
        if (brandsRes.ok && Array.isArray(brandsData.sellerBrands)) {
          setBrandOptions(brandsData.sellerBrands as string[]);
        }
        if (!hintsRes.ok || !hintsData.dominantListing) return;
        const d = hintsData.dominantListing as {
          brand: string;
          model: string;
          model_year: number | null;
        };
        const sellerBrands = (brandsRes.ok && Array.isArray(brandsData.sellerBrands)
          ? (brandsData.sellerBrands as string[])
          : [...MARKET_BRANDS]) as string[];
        const resolvedBrand =
          sellerBrands.find((b) => b.toLowerCase() === d.brand.trim().toLowerCase()) ??
          normalizeMarketBrand(d.brand);
        setForm((f) => ({
          ...f,
          brand: resolvedBrand,
          // Model left blank — seller's last listing must not block photo identification.
          model_year: f.model_year || (d.model_year ? String(d.model_year) : ''),
        }));
      } catch {
        // Non-fatal — seller can set brand manually
      }
    })();
  }, []);

  const isUsed = form.wear_state === 'used';
  const isBnibInventory = supportsMultiSizeInventory(form.wear_state);
  const isPricedListing = form.listing_type === 'sell';
  const isCollection = form.listing_type === 'collection';
  const updateImage = (imageId: string, patch: Partial<MarketListingImageRow>) => {
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, ...patch } : img))
    );
  };

  const imageKey = images.map((i) => i.id).join(',');

  const mergeFormPatch = useCallback((patch: Partial<typeof form>) => {
    if (!Object.keys(patch).length) return;
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const confirmIdentity = useCallback(() => {
    setIdentityConfirmed(true);
    lastCatalogEnrichKey.current = null;
    descriptionAutoKey.current = null;
  }, []);

  const handleIdentityFieldEdit = useCallback(() => {
    setShoeIdentityLocked(true);
    setIdentityConfirmed(true);
    lastCatalogEnrichKey.current = null;
    descriptionAutoKey.current = null;
    setForm((f) => {
      if (aiDescriptionDraft && !descriptionTouched && f.description.trim()) {
        return { ...f, description: '' };
      }
      return f;
    });
    if (aiDescriptionDraft && !descriptionTouched) {
      setAiDescriptionDraft(false);
    }
  }, [aiDescriptionDraft, descriptionTouched]);

  const setListingType = (listingType: MarketListingType) => {
    setForm((f) => ({
      ...f,
      listing_type: listingType,
      open_to_trade: listingType === 'sell' ? f.open_to_trade : false,
      accepts_offers:
        listingType === 'collection' || listingType === 'sell'
          ? f.listing_type === listingType
            ? f.accepts_offers
            : true
          : false,
      price_cents: listingType === 'sell' ? f.price_cents : '',
      shipping_cents: listingType === 'collection' ? '0' : f.shipping_cents,
    }));
    if (listingType === 'collection') {
      setAiPrice(null);
    }
    if (images.length > 0 && !pipelineRunning.current) {
      lastAutoKey.current = null;
    }
  };

  const setWearState = (wearState: MarketWearState) => {
    setForm((f) => ({
      ...f,
      wear_state: wearState,
      condition: wearState === 'used' ? (f.condition === 'new' ? 'good' : f.condition) : 'new',
    }));
    if (supportsMultiSizeInventory(wearState) && sizeInventory.length === 0) {
      setSizeInventory([emptySizeInventoryRow(form.size || '10')]);
    }
    setAiCondition(null);
    setAiPrice(null);
    setConditionOverridden(false);
    lastAutoKey.current = null;
    lastCatalogEnrichKey.current = null;
    if (wearState === 'used' && images.length > 0 && formRef.current.model.trim().length >= 2) {
      void runSequentialListingPipeline({ skipShoeId: true, overwriteCatalogFields: false });
    }
  };

  const ensureDraft = () => ensureListingDraft();

  const refreshImagesFromServer = async (id: string) => {
    const refreshed = await fetchListingImagesForClient(id);
    setImages(refreshed);
    return refreshed;
  };

  const removePhoto = async (imageId: string) => {
    if (!listingId) return;
    setUploadError(null);
    photosDirtyRef.current = true;
    try {
      const res = await fetch(`/api/market/listings/${listingId}/images/${imageId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not remove photo');
      const refreshed = await refreshImagesFromServer(listingId);
      if (!refreshed.length) {
        setShoeIdResult(null);
        setShoeIdAutoApplied(false);
        setAiCondition(null);
        setAiPrice(null);
        lastAutoKey.current = null;
        lastCatalogEnrichKey.current = null;
        descriptionAutoKey.current = null;
        if (!shoeIdentityLocked) {
          setIdentityConfirmed(false);
        }
        setWizardStep('photos');
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not remove photo');
    }
  };

  const onImagesChange = (imgs: ListingImage[]) => {
    photosDirtyRef.current = true;
    setImages(imgs);
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? []);
    if (!rawFiles.length) return;
    if (photoUploadLock.current) return;
    photoUploadLock.current = true;
    setError(null);
    setUploadError(null);
    setUploading(true);
    try {
      setUploadProgress('Preparing photos…');
      const { files, prepareErrors } = await prepareListingPhotos(rawFiles);

      if (!files.length) {
        throw new Error(
          prepareErrors[0] ||
            'Could not read these photos. If they are iPhone HEIC, try Settings → Camera → Formats → Most Compatible.'
        );
      }

      const id = await ensureDraft();
      let serverCount = (await fetchListingImagesForClient(id)).length;
      const uploadErrors: string[] = [...prepareErrors];

      for (let i = 0; i < files.length; i++) {
        if (serverCount >= MAX_PHOTOS) {
          setUploadError(`Maximum ${MAX_PHOTOS} photos per listing.`);
          break;
        }
        setUploadProgress(`Uploading ${i + 1} of ${files.length}…`);
        const fd = new FormData();
        fd.append('file', files[i]);
        const res = await fetch(`/api/market/listings/${id}/images`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
          uploadErrors.push(data.error || `Photo ${i + 1} failed to upload`);
          continue;
        }
        if (data.image) {
          serverCount += 1;
        }
      }

      const mergedImages = await normalizeListingImagesForClient(id);
      photosDirtyRef.current = false;
      setImages(mergedImages);

      if (!mergedImages.length) {
        throw new Error(uploadErrors[0] || 'No photos uploaded — try again.');
      }

      if (uploadErrors.length) {
        setUploadError(
          `${uploadErrors.length} photo(s) failed — ${uploadErrors[0]}. Others were saved.`
        );
      }

      const pipelineKey = `${mergedImages.map((i) => i.id).join(',')}|${form.wear_state}`;
      lastAutoKey.current = pipelineKey;

      setAiCondition(null);
      setAiPrice(null);
      setConditionOverridden(false);
      setShoeIdResult(null);
      setShoeIdAutoApplied(false);
      if (!shoeIdentityLocked) {
        setIdentityConfirmed(false);
      }
      setAiPipelineError(null);
      lastCatalogEnrichKey.current = null;
      descriptionAutoKey.current = null;

      await runSequentialListingPipeline({ imageOverride: mergedImages });
      setWizardStep('confirm');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(msg);
      setError(msg);
      if (listingIdRef.current) {
        try {
          await refreshImagesFromServer(listingIdRef.current);
        } catch {
          // Keep partial local state if refresh fails
        }
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      photoUploadLock.current = false;
      e.target.value = '';
    }
  };

  const resolveColorFamily = (colorFamily: string, colorway: string) =>
    parseColorFamily(colorFamily) ?? inferColorFamilyFromColorway(colorway.trim() || null);

  const draftPayload = (overrides?: Partial<typeof form>) => {
    const merged = { ...form, ...overrides };
    const colorway = merged.colorway.trim();
    const color_family = resolveColorFamily(merged.color_family, colorway);
    return {
      title: merged.title || `${merged.brand} ${merged.model}`.trim(),
      brand: merged.brand,
      model: merged.model,
      colorway: colorway || null,
      color_family,
      model_year: merged.model_year ? Number(merged.model_year) : null,
      size: Number(merged.size),
      wear_state: merged.wear_state,
      condition: conditionForWearState(merged.wear_state, merged.condition),
      listing_type: merged.listing_type,
      open_to_trade: merged.listing_type === 'sell' ? merged.open_to_trade : false,
      accepts_offers:
        merged.listing_type === 'collection' || merged.listing_type === 'sell'
          ? merged.accepts_offers !== false
          : false,
      description: merged.description,
      collector_notes: merged.collector_notes.trim() || null,
      rarity: merged.rarity || null,
      weight_class: merged.weight_class.trim() || null,
      ...(merged.listing_type === 'collection'
        ? collectionPurchaseNotesToPayload(purchaseNotes)
        : {}),
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

  const agentPromptInput = (
    sellerNote?: string,
    overrides?: Partial<typeof form>,
    collectorNotesOverride?: string | null,
    conditionAnalysisOverride?: AiCondition | null
  ) => {
    const merged = { ...form, ...overrides };
    const conditionForPrompt = conditionAnalysisOverride ?? aiCondition;
    return {
      brand: merged.brand,
      model: merged.model,
      colorway: merged.colorway,
      modelYear: merged.model_year ? Number(merged.model_year) : null,
      size: Number(merged.size) || 10,
      wearState: merged.wear_state,
      condition: conditionForWearState(merged.wear_state, merged.condition),
      listingType: merged.listing_type,
      rarity: merged.rarity || null,
      weightClass: merged.weight_class || null,
      collectorNotes:
        merged.collector_notes?.trim() ||
        collectorNotesOverride?.trim() ||
        catalogCollectorNotes?.trim() ||
        null,
      upperMaterial: catalogUpperMaterial,
      soleDescription: catalogSoleDescription,
      sellerNote,
      conditionAnalysis: conditionForPrompt,
    };
  };

  const generateDescription = useCallback(
    async (opts?: {
      sellerNote?: string;
      silent?: boolean;
      overrides?: Partial<typeof form>;
      collectorNotes?: string | null;
      force?: boolean;
      conditionAnalysis?: AiCondition | null;
    }) => {
      const merged = { ...form, ...opts?.overrides };
      const conditionForPrompt = opts?.conditionAnalysis ?? aiCondition;
      if (!merged.model.trim()) {
        if (!opts?.silent) {
          setError('Add a model (or use Shoe ID) before generating a description.');
        }
        return;
      }

      const autoKey = `${listingId ?? 'draft'}|${merged.brand.trim()}|${merged.model.trim()}|${merged.colorway.trim()}`;
      if (opts?.silent && descriptionAutoKey.current === autoKey) {
        return;
      }
      if (opts?.silent) {
        descriptionAutoKey.current = autoKey;
      }

      if (!opts?.silent) {
        descriptionEditedDuringAgentRef.current = false;
      }
      setAgentLoading(true);
      if (!opts?.silent) setAgentReply(null);
      setError(null);
      try {
        const id = await syncDraft();
        const res = await fetch('/api/market/ai/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId: id,
            messages: [
              {
                role: 'user',
                content: buildListingAgentPrompt(
                  agentPromptInput(
                    opts?.sellerNote,
                    opts?.overrides,
                    opts?.collectorNotes,
                    conditionForPrompt
                  )
                ),
              },
            ],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Description failed');

        if (descriptionEditedDuringAgentRef.current) return;
        if (opts?.silent && descriptionTouchedRef.current && !opts?.force) return;

        if (data.has_draft && (data.draft?.description || data.draft?.colorway)) {
          const clean = data.draft?.description
            ? sanitizeBuyerListingDescription(data.draft.description)
            : '';
          const draftColorway = data.draft?.colorway?.trim() || '';
          setForm((f) => ({
            ...f,
            ...(clean ? { description: clean } : {}),
            ...(draftColorway && (!f.colorway.trim() || opts?.silent)
              ? {
                  colorway: draftColorway,
                  color_family:
                    inferColorFamilyFromColorway(draftColorway) || f.color_family,
                }
              : {}),
          }));
          if (clean) {
            setDescriptionTouched(false);
            descriptionTouchedRef.current = false;
            setAiDescriptionDraft(true);
          }
          setAgentInput('');
          setAgentReply(null);
        } else if (data.message) {
          setAgentReply(data.message);
        } else if (!opts?.silent) {
          setError('Could not generate description — try again.');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Description failed';
        if (!opts?.silent) {
          setError(msg);
        }
        setAgentReply(msg);
        setAiPipelineError(msg);
      } finally {
        setAgentLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, aiCondition, listingId]
  );

  const syncDraft = async () => {
    const id = await ensureDraft();
    await fetch(`/api/market/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftPayload()),
    });
    return id;
  };

  const prefillCollectorNotesFromCatalog = useCallback((notes: string | null | undefined) => {
    const trimmed = notes?.trim();
    if (!trimmed) return;
    setForm((f) => (f.collector_notes.trim() ? f : { ...f, collector_notes: trimmed }));
  }, []);

  const saveShoeIdentity = async () => {
    if (!form.model.trim()) {
      setError('Add a model before saving.');
      return;
    }
    setIdentitySaving(true);
    setIdentitySavedFlash(false);
    setError(null);
    try {
      const colorway = form.colorway.trim();
      const color_family = resolveColorFamily(form.color_family, colorway);
      const identityPatch = {
        brand: form.brand,
        model: form.model.trim(),
        colorway: colorway,
        color_family: color_family ?? '',
        title: `${form.brand} ${form.model}`.trim(),
      };
      const id = await ensureDraft();
      const res = await fetch(`/api/market/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: identityPatch.brand,
          model: identityPatch.model,
          colorway: colorway || null,
          color_family: color_family,
          title: identityPatch.title,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Save failed');
      }
      mergeFormPatch(identityPatch);
      confirmIdentity();
      lastCatalogEnrichKey.current = null;
      descriptionAutoKey.current = null;
      await runSequentialListingPipeline({
        skipShoeId: true,
        overwriteCatalogFields: true,
        refreshDescription: true,
      });
      setIdentitySavedFlash(true);
      window.setTimeout(() => setIdentitySavedFlash(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIdentitySaving(false);
    }
  };

  const runPrice = useCallback(async (overrides?: Partial<typeof form>) => {
    if ((overrides?.listing_type ?? form.listing_type) === 'collection') return;
    setPricing(true);
    try {
      const id = await ensureDraft();
      const payload = draftPayload(overrides);
      await fetch(`/api/market/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const res = await fetch('/api/market/ai/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Price failed');
      if (data.price) {
        setAiPrice({
          suggested_low_cents: data.price.suggested_low_cents,
          suggested_mid_cents: data.price.suggested_mid_cents,
          suggested_high_cents: data.price.suggested_high_cents,
          confidence_note: data.price.confidence_note,
          comps: data.price.comps ?? [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Price failed');
    } finally {
      setPricing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, listingId]);

  const runRarity = useCallback(
    async (id: string, overrides?: Partial<typeof form>): Promise<Partial<typeof form>> => {
      const merged = { ...form, ...overrides };
      const brand = merged.brand.trim();
      const model = merged.model.trim();
      if (!brand || !model) return {};
      if (normalizeMarketRarity(merged.rarity)) return {};

      try {
        const res = await fetch('/api/market/ai/rarity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listingId: id,
            brand,
            model,
            colorway: merged.colorway.trim() || null,
            model_year: merged.model_year ? Number(merged.model_year) : null,
            persist: true,
          }),
        });
        const data = await res.json();
        if (res.ok && data.rarity) {
          const rarity = normalizeMarketRarity(data.rarity);
          if (rarity) {
            setForm((f) => ({ ...f, rarity }));
            return { rarity };
          }
        }
      } catch {
        // Non-fatal — seller can set rarity manually
      }
      return {};
    },
    [form]
  );

  const runCatalogEnrich = useCallback(
    async (
      overrides?: Partial<typeof form>,
      opts?: { overwriteCatalogFields?: boolean }
    ): Promise<{ patch: Partial<typeof form>; collectorNotes: string | null }> => {
      const merged = { ...form, ...overrides };
      const brand = merged.brand.trim();
      const model = merged.model.trim();
      if (!brand || model.length < 2) return { patch: {}, collectorNotes: null };

      try {
        const id = await ensureDraft();
        const res = await fetch('/api/market/catalog/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand,
            model,
            colorway: merged.colorway.trim() || null,
            listingId: id,
            persist: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAiPipelineError(data.error || 'Could not look up shoe details');
          setCatalogCollectorNotes(null);
          setCatalogUpperMaterial(null);
          setCatalogSoleDescription(null);
          return { patch: {}, collectorNotes: null };
        }

        const collectorNotes =
          typeof data.collector_notes === 'string' && data.collector_notes.trim()
            ? data.collector_notes.trim()
            : null;
        setCatalogCollectorNotes(collectorNotes);
        setCatalogUpperMaterial(
          typeof data.upper_material === 'string' && data.upper_material.trim()
            ? data.upper_material.trim()
            : null
        );
        setCatalogSoleDescription(
          typeof data.sole_description === 'string' && data.sole_description.trim()
            ? data.sole_description.trim()
            : null
        );

        const enrichment: ListingEnrichment = {
          model_year: data.model_year ?? undefined,
          weight_class: data.weight_class ?? undefined,
          rarity: data.rarity ? normalizeMarketRarity(data.rarity) ?? undefined : undefined,
          colorway:
            typeof data.colorway === 'string' && data.colorway.trim()
              ? data.colorway.trim()
              : undefined,
          upper_material:
            typeof data.upper_material === 'string' ? data.upper_material : undefined,
          sole_description:
            typeof data.sole_description === 'string' ? data.sole_description : undefined,
        };
        const patch = enrichmentToFormPatch(enrichment, merged, {
          fillEmptyOnly: !opts?.overwriteCatalogFields,
        });
        if (Object.keys(patch).length) mergeFormPatch(patch);
        return { patch, collectorNotes };
      } catch {
        return { patch: {}, collectorNotes: null };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, mergeFormPatch, listingId]
  );

  const runPhotoCondition = useCallback(
    async (
      id: string,
      overrides?: Partial<typeof form>
    ): Promise<{ patch: Partial<typeof form>; analysis: AiCondition | null }> => {
      const merged = { ...form, ...overrides };
      try {
        const res = await fetch('/api/market/ai/condition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: id, wear_state: merged.wear_state }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error || 'Condition analysis failed';
          setAiPipelineError(msg);
          return { patch: {}, analysis: null };
        }

        const analysis = data.analysis as AiCondition;
        setAiCondition(analysis);
        setConditionOverridden(false);

        const autoGrade = conditionGradeFromAnalysis(merged.wear_state, analysis.grade);
        if (autoGrade) {
          mergeFormPatch({ condition: autoGrade });
          return { patch: { condition: autoGrade }, analysis };
        }
        return { patch: {}, analysis };
      } catch {
        // Non-fatal — catalog and description can still run
      }
      return { patch: {}, analysis: null };
    },
    [form, mergeFormPatch]
  );

  const applyShoeIdToForm = useCallback(
    (result: ShoeIdResult, catalogEnrichment?: ListingEnrichment | null) => {
      const enrichment: ListingEnrichment = {
        ...enrichmentFromShoeIdResult(result),
        ...(catalogEnrichment ?? {}),
      };
      const patch = enrichmentToFormPatch(enrichment, formRef.current, {
        fillEmptyOnly: false,
        colorwayOnly: shoeIdentityLocked,
      });
      if (Object.keys(patch).length) mergeFormPatch(patch);
      setShoeIdAutoApplied(true);
      lastCatalogEnrichKey.current = null;
      descriptionAutoKey.current = null;
      if (aiDescriptionDraft && !descriptionTouchedRef.current) {
        setForm((f) => ({ ...f, description: '' }));
        setAiDescriptionDraft(false);
      }
    },
    [mergeFormPatch, shoeIdentityLocked, aiDescriptionDraft]
  );

  const runShoeIdentification = useCallback(
    async (imageOverride?: ListingImage[]): Promise<boolean> => {
      if (pipelineRunning.current || shoeIdentityLocked) return false;
      const imageList = imageOverride ?? images;
      if (!imageList.length) return false;

      pipelineRunning.current = true;
      setIdentifyingShoe(true);
      setPipelineStep('identifying');
      setAiPipelineError(null);
      setError(null);
      let canContinue = false;
      try {
        const id = await ensureDraft();
        const data = await identifyListingShoe({
          listingId: id,
          images: imageList.map((i) => i.public_url),
          brandHint: shoeIdentityLocked ? form.brand.trim() || undefined : undefined,
          modelHint: shoeIdentityLocked ? form.model.trim() || undefined : undefined,
        });
        const result = data.result as ShoeIdResult;
        setShoeIdResult(result);
        const disagree = visionDisagreesWithForm(result, formRef.current);
        if (data.autoApplyRecommended !== false) {
          const enrichment: ListingEnrichment = {
            ...enrichmentFromShoeIdResult(result),
            ...(data.catalogEnrichment ?? {}),
          };
          const shoeOverrides = enrichmentToFormPatch(enrichment, formRef.current, {
            fillEmptyOnly: shoeIdentityLocked ? true : !disagree,
            colorwayOnly: shoeIdentityLocked,
          });
          if (Object.keys(shoeOverrides).length) mergeFormPatch(shoeOverrides);
          setShoeIdAutoApplied(true);
          if (disagree && !shoeIdentityLocked) {
            lastCatalogEnrichKey.current = null;
            descriptionAutoKey.current = null;
            if (aiDescriptionDraft && !descriptionTouchedRef.current) {
              setForm((f) => ({ ...f, description: '' }));
              setAiDescriptionDraft(false);
            }
          }
        }
        const autoConfirmed = shouldAutoConfirmIdentity({
          catalogMatchId: data.catalogMatchId,
          result,
        });
        if (autoConfirmed) confirmIdentity();
        canContinue =
          (shoeIdentityLocked && formRef.current.model.trim().length >= 2) ||
          autoConfirmed ||
          (!disagree && result.model.trim().length >= 2);
        setUploadError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Shoe identification failed';
        setAiPipelineError(msg);
        setError(msg);
        canContinue = false;
      } finally {
        setIdentifyingShoe(false);
        setPipelineStep('idle');
        pipelineRunning.current = false;
      }
      return canContinue;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.brand, form.model, images, listingId, mergeFormPatch, shoeIdentityLocked, confirmIdentity]
  );

  const runMetadataPipeline = useCallback(
    async (opts?: {
      overwriteCatalogFields?: boolean;
      refreshDescription?: boolean;
    }) => {
      if (pipelineRunning.current) return;
      const brand = formRef.current.brand.trim();
      const model = formRef.current.model.trim();
      if (!brand || model.length < 2) return;

      pipelineRunning.current = true;
      setAnalyzing(true);
      setCatalogEnriching(true);
      setAiPipelineError(null);
      setError(null);
      let overrides: Partial<typeof form> = {};
      const formBase = () => ({ ...formRef.current, ...overrides });
      try {
        const id = await ensureDraft();
        const enrichKey = `${brand}|${model}|${formRef.current.wear_state}|${images.map((i) => i.id).join(',')}`;

        setPipelineStep('catalog');
        const { patch: catalogPatch, collectorNotes } = await runCatalogEnrich(undefined, {
          overwriteCatalogFields: opts?.overwriteCatalogFields ?? true,
        });
        overrides = { ...overrides, ...catalogPatch };
        prefillCollectorNotesFromCatalog(collectorNotes);
        lastCatalogEnrichKey.current = enrichKey;

        const mergedAfterCatalog = formBase();
        if (mergedAfterCatalog.brand.trim() && mergedAfterCatalog.model.trim().length >= 2) {
          void fetch('/api/market/ai/shoe-about', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listingId: id,
              brand: mergedAfterCatalog.brand.trim(),
              model: mergedAfterCatalog.model.trim(),
              modelYear: mergedAfterCatalog.model_year
                ? Number(mergedAfterCatalog.model_year)
                : null,
            }),
          }).catch(() => {});
        }

        await fetch(`/api/market/listings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftPayload(overrides)),
        });

        let conditionAnalysis: AiCondition | null = null;
        if (images.length > 0 && formBase().wear_state === 'used') {
          setPipelineStep('condition');
          const conditionResult = await runPhotoCondition(id, overrides);
          overrides = { ...overrides, ...conditionResult.patch };
          conditionAnalysis = conditionResult.analysis;
        }

        setPipelineStep('rarity');
        const rarityPatch = await runRarity(id, overrides);
        overrides = { ...overrides, ...rarityPatch };
        if (Object.keys(rarityPatch).length) {
          await fetch(`/api/market/listings/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draftPayload(overrides)),
          });
        }

        const listingType = formBase().listing_type;
        if (listingType !== 'collection' && images.length > 0) {
          setPipelineStep('price');
          await runPrice(overrides);
        }

        const modelAfterId = formBase().model.trim();
        if (modelAfterId && (!descriptionTouched || opts?.refreshDescription)) {
          setPipelineStep('description');
          descriptionAutoKey.current = null;
          await generateDescription({
            silent: true,
            overrides,
            collectorNotes,
            force: opts?.refreshDescription,
            conditionAnalysis,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed');
      } finally {
        setAnalyzing(false);
        setCatalogEnriching(false);
        setPipelineStep('idle');
        pipelineRunning.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      images,
      listingId,
      runPrice,
      descriptionTouched,
      generateDescription,
      runRarity,
      runCatalogEnrich,
      runPhotoCondition,
    ]
  );

  const runSequentialListingPipeline = useCallback(
    async (opts?: {
      imageOverride?: ListingImage[];
      refreshDescription?: boolean;
      overwriteCatalogFields?: boolean;
      skipShoeId?: boolean;
    }) => {
      if (pipelineRunning.current) return;

      if (!opts?.skipShoeId && !shoeIdentityLocked && (opts?.imageOverride?.length ?? images.length) > 0) {
        const canContinue = await runShoeIdentification(opts?.imageOverride);
        if (canContinue) {
          await runMetadataPipeline({
            overwriteCatalogFields: opts?.overwriteCatalogFields ?? true,
            refreshDescription: opts?.refreshDescription,
          });
        }
        return;
      }

      if (formRef.current.model.trim().length >= 2) {
        await runMetadataPipeline({
          overwriteCatalogFields: opts?.overwriteCatalogFields ?? true,
          refreshDescription: opts?.refreshDescription,
        });
      }
    },
    [images.length, runMetadataPipeline, runShoeIdentification, shoeIdentityLocked]
  );

  const applyAiGrade = () => {
    if (!isUsed || !aiCondition?.grade) return;
    if (!(USED_CONDITIONS as readonly string[]).includes(aiCondition.grade)) return;

    const newCondition = aiCondition.grade;
    setForm((f) => ({
      ...f,
      condition: newCondition,
    }));
    setConditionOverridden(false);
    if (form.listing_type !== 'collection') void runPrice();
  };

  const overrideCondition = () => {
    setConditionOverridden(true);
    if (form.listing_type !== 'collection' && !aiPrice && !pricing) void runPrice();
  };

  const applySuggestedPrice = () => {
    if (aiPrice) {
      setForm((f) => ({
        ...f,
        price_cents: String(Math.round(aiPrice.suggested_mid_cents / 100)),
      }));
    }
  };

  const submitAgent = async () => {
    const text = agentInput.trim();
    await generateDescription(text ? { sellerNote: text } : undefined);
  };

  const saveSizeInventory = async (listingId: string) => {
    if (!supportsMultiSizeInventory(form.wear_state)) return;
    const res = await fetch(`/api/market/listings/${listingId}/sizes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sizes: sizeInventory.map((row) => ({
          size_us: row.size_us,
          quantity: row.quantity,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save sizes');
    if (data.sizes?.length) {
      const minSize = Math.min(...data.sizes.map((s: { size_us: number }) => Number(s.size_us)));
      setForm((f) => ({ ...f, size: String(minSize) }));
    }
  };

  const publish = async () => {
    setError(null);
    if (images.length === 0) {
      setError('Add at least one photo before publishing.');
      return;
    }
    try {
      const id = await ensureDraft();
      if (photosDirtyRef.current) {
        const savedImages = await normalizeListingImagesForClient(id);
        photosDirtyRef.current = false;
        setImages(savedImages);
        if (savedImages.length === 0) {
          setError('Photos did not save — add photos again before publishing.');
          return;
        }
        if (savedImages.length < images.length) {
          setError(
            `Only ${savedImages.length} of ${images.length} photos saved. Add missing photos before publishing.`
          );
          return;
        }
      }

      const description = resolveListingDescriptionForSave(
        form.description,
        descriptionTouchedRef.current,
        descriptionInput()
      );
      const priceNum =
        form.listing_type === 'sell'
          ? Math.round(Number(form.price_cents || 0) * 100)
          : null;
      const shipNum =
        form.listing_type === 'collection'
          ? 0
          : Math.round(Number(form.shipping_cents || 0) * 100);

      const res = await fetch(`/api/market/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draftPayload(),
          description,
          price_cents: priceNum,
          shipping_cents: shipNum,
          status: 'active',
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Publish failed');
      }

      await saveSizeInventory(id);

      if (!form.rarity) {
        void fetch('/api/market/ai/rarity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: id, persist: true }),
        });
      }

      router.replace(`/market/listing/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const midPrice = aiPrice ? Math.round(aiPrice.suggested_mid_cents / 100) : 0;
  const wizardStepIndex = SELLER_WIZARD_STEPS.findIndex((step) => step.key === wizardStep);
  const identityReady = Boolean(form.brand.trim() && form.model.trim());
  const isBusy = uploading || analyzing || identifyingShoe || catalogEnriching || agentLoading;
  const canContinueWizard =
    wizardStep === 'photos'
      ? images.length > 0 && !uploading
      : wizardStep === 'confirm'
        ? identityReady && !identifyingShoe && !identitySaving
        : wizardStep === 'condition'
          ? identityReady && !isBusy
          : true;
  const wizardCopy =
    wizardStep === 'photos'
      ? 'Start with photos. The Guild will try to identify the shoe and tee up the listing.'
      : wizardStep === 'confirm'
        ? 'Confirm or correct the brand, model, and colorway. If you correct it, AI refreshes from that truth.'
        : wizardStep === 'condition'
          ? 'Set condition and value. AI can suggest, but the seller makes the call.'
          : 'Choose collection, sale, or trade, then review the buyer-facing story before publishing.';
  const nextWizardLabel =
    wizardStep === 'photos'
      ? 'Confirm shoe'
      : wizardStep === 'confirm'
        ? 'Condition & value'
        : wizardStep === 'condition'
          ? 'Review listing'
          : '';
  const showPhotoAiSection =
    wizardStep === 'photos' ||
    wizardStep === 'confirm' ||
    uploading ||
    analyzing ||
    identifyingShoe ||
    catalogEnriching ||
    pricing ||
    agentLoading ||
    Boolean(aiCondition) ||
    Boolean(aiPrice);
  const highestAvailableWizardIndex = !images.length ? 0 : identityReady ? 3 : 1;

  const goToWizardStep = (step: SellerWizardStep) => {
    setWizardStep(step);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const continueWizard = () => {
    setError(null);
    if (wizardStep === 'photos') {
      if (!images.length) {
        setError('Add at least one photo before continuing.');
        return;
      }
      goToWizardStep('confirm');
      return;
    }
    if (wizardStep === 'confirm') {
      if (!identityReady) {
        setError('Confirm the brand and model before continuing.');
        return;
      }
      confirmIdentity();
      void runSequentialListingPipeline({
        skipShoeId: true,
        overwriteCatalogFields: true,
        refreshDescription: true,
      });
      goToWizardStep('condition');
      return;
    }
    if (wizardStep === 'condition') {
      goToWizardStep('review');
    }
  };

  return (
    <div className="min-h-screen pb-28 px-4 pt-4 max-w-lg mx-auto space-y-5">
      <BackLink
        fallbackHref={isCollection ? '/market/my-listings' : '/market'}
        label={isCollection ? 'My Market' : 'Back to Market'}
      />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {SELLER_WIZARD_STEPS[wizardStepIndex]?.title ??
            (isCollection ? 'Add to your collection' : 'List a pair')}
        </h1>
        <p className="text-sm text-muted-foreground leading-snug">
          {wizardCopy}
        </p>
      </header>

      <nav
        aria-label="Listing progress"
        className="rounded-2xl border border-border bg-card p-3 space-y-3"
      >
        <div className="grid grid-cols-4 gap-2">
          {SELLER_WIZARD_STEPS.map((step, index) => {
            const active = step.key === wizardStep;
            const complete = index < wizardStepIndex;
            return (
              <button
                key={step.key}
                type="button"
                disabled={index > highestAvailableWizardIndex}
                onClick={() => {
                  if (index <= highestAvailableWizardIndex) goToWizardStep(step.key);
                }}
                className={cn(
                  'rounded-xl px-2 py-2 text-[11px] font-semibold transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : complete
                      ? 'bg-accent/10 text-accent'
                      : 'bg-muted/60 text-muted-foreground',
                  index > highestAvailableWizardIndex && 'opacity-50'
                )}
              >
                {step.label}
              </button>
            );
          })}
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{
              width: `${((wizardStepIndex + 1) / SELLER_WIZARD_STEPS.length) * 100}%`,
            }}
          />
        </div>
      </nav>

      {/* —— 1. Photos + AI —— */}
      <section className={cn('space-y-3', !showPhotoAiSection && 'hidden')} aria-label="Photos">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {wizardStep === 'condition' || wizardStep === 'review' ? 'AI summary' : 'Photos'}
          </h2>
          {wizardStep === 'photos' || wizardStep === 'confirm' ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {images.length}/{MAX_PHOTOS}
            </span>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={onPhoto}
          disabled={uploading || images.length >= MAX_PHOTOS}
        />
        {wizardStep === 'photos' || wizardStep === 'confirm' ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || images.length >= MAX_PHOTOS}
            className={cn(
              'w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors touch-manipulation active:scale-[0.99]',
              images.length === 0 ? 'min-h-[168px] py-6' : 'py-4 border-dashed',
              error && images.length === 0
                ? 'border-destructive/50 text-destructive bg-destructive/5'
                : uploadError
                  ? 'border-destructive/50 text-destructive'
                  : images.length === 0
                    ? 'border-accent/40 bg-accent/5 text-accent hover:bg-accent/10'
                    : 'border-border text-muted-foreground hover:border-accent/50'
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm font-medium">{uploadProgress ?? 'Uploading…'}</span>
              </>
            ) : (
              <>
                <Plus className={cn('shrink-0', images.length === 0 ? 'h-8 w-8' : 'h-5 w-5')} />
                <span className="text-sm font-medium">
                  {images.length
                    ? `Add photo (${images.length}/${MAX_PHOTOS})`
                    : 'Tap to add photos'}
                </span>
                {images.length === 0 ? (
                  <span className="text-xs text-muted-foreground px-4 text-center leading-snug">
                    Clear shot on a plain background works best
                  </span>
                ) : null}
              </>
            )}
          </button>
        ) : null}
        {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
        {aiPipelineError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <p className="text-sm text-destructive">{aiPipelineError}</p>
            <button
              type="button"
              onClick={() => {
                void runSequentialListingPipeline({ overwriteCatalogFields: true });
              }}
              className="text-xs text-accent hover:text-accent/80"
            >
              Retry AI analysis
            </button>
          </div>
        ) : null}
        {images.length > 0 && listingId && (wizardStep === 'photos' || wizardStep === 'confirm') ? (
          <ListingPhotoGrid
            listingId={listingId}
            images={images}
            onImagesChange={onImagesChange}
            onUpdateImage={updateImage}
            onRemove={(imageId) => void removePhoto(imageId)}
          />
        ) : null}

        {listingId && images.length > 0 && wizardStep === 'confirm' ? (
          <ShoeIdCard
            listingId={listingId}
            images={images}
            externalResult={shoeIdResult}
            externalLoading={identifyingShoe}
            autoApplied={shoeIdAutoApplied}
            userLocked={shoeIdentityLocked}
            formBrand={form.brand}
            formModel={form.model}
            onAccept={(payload, opts) => {
              const enrichment: ListingEnrichment = {
                brand: payload.brand,
                model: payload.model,
                colorway: payload.colorway,
                color_family: inferColorFamilyFromColorway(payload.colorway?.trim() || '') || undefined,
              };
              const shoeOverrides = enrichmentToFormPatch(enrichment, form, opts);
              mergeFormPatch(shoeOverrides);
              if (!opts?.colorwayOnly) {
                confirmIdentity();
                setWizardStep('condition');
                setShoeIdAutoApplied(true);
                void runSequentialListingPipeline({ skipShoeId: true, overwriteCatalogFields: true });
              }
            }}
          />
        ) : null}

        {shoeIdResult && !identityConfirmed && !identifyingShoe && wizardStep === 'confirm' ? (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 space-y-2">
            {visionDisagreesWithForm(shoeIdResult, form) ? (
              <p className="text-sm text-foreground">
                Photos look like{' '}
                <span className="font-medium">
                  {shoeIdResult.brand} {shoeIdResult.model}
                </span>
                , but the form still says{' '}
                <span className="font-medium">
                  {form.brand} {form.model}
                </span>
                . Update from your photos before generating a description.
              </p>
            ) : (
              <p className="text-sm text-foreground">
                AI suggested{' '}
                <span className="font-medium">
                  {shoeIdResult.brand} {shoeIdResult.model}
                </span>
                . Fix brand or model if wrong, then continue.
              </p>
            )}
            <Button
              type="button"
              size="sm"
              className="w-full bg-accent text-accent-foreground"
              onClick={() => {
                applyShoeIdToForm(shoeIdResult);
                confirmIdentity();
                setWizardStep('condition');
                void runSequentialListingPipeline({ skipShoeId: true, overwriteCatalogFields: true });
              }}
            >
              {visionDisagreesWithForm(shoeIdResult, form)
                ? `Use ${shoeIdResult.brand} ${shoeIdResult.model} from photos`
                : 'Looks correct — fill in details'}
            </Button>
          </div>
        ) : null}

        {identityConfirmed && pipelineStep !== 'idle' && pipelineStep !== 'identifying' ? (
          <p className="text-xs text-muted-foreground px-1">
            {pipelineStep === 'catalog'
              ? 'Looking up catalog details…'
              : pipelineStep === 'condition'
                ? 'AI assessing condition from photos…'
                : pipelineStep === 'rarity'
                  ? 'Checking collection context…'
                  : pipelineStep === 'price'
                    ? 'Suggesting price from model, condition, and sale history…'
                    : 'Writing listing description…'}
          </p>
        ) : null}

        {images.length > 0 && identifyingShoe ? (
          <AiSpinner label="Step 1 — recognizing brand and model from photos…" />
        ) : null}

        {images.length > 0 && analyzing && !identifyingShoe ? (
          <AiSpinner
            label={
              pipelineStep === 'condition'
                ? 'Step 3 — AI assessing condition…'
                : pipelineStep === 'rarity'
                  ? 'Step 4 — checking collection context…'
                  : pipelineStep === 'price'
                    ? 'Step 5 — suggesting price…'
                    : pipelineStep === 'description'
                      ? 'Step 6 — writing description…'
                      : 'Step 2 — pulling catalog metadata…'
            }
          />
        ) : null}

        {catalogEnriching && !analyzing && !identifyingShoe ? (
          <AiSpinner label="Step 2 — looking up catalog metadata…" />
        ) : null}

        {aiCondition && !analyzing && (wizardStep === 'condition' || wizardStep === 'review') ? (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-accent" />
                <span>AI condition read</span>
              </div>
              <span className="text-lg font-bold text-accent">
                {aiCondition.wrestle_score.toFixed(1)} / 10
              </span>
            </div>
            <div className="border-t border-border" />
            <div className="grid grid-cols-2 gap-2">
              {BREAKDOWN_KEYS.map((key) => (
                <div
                  key={key}
                  className="rounded-lg bg-muted border border-border px-3 py-2 text-center"
                >
                  <p className="text-[10px] text-muted-foreground capitalize">{key}</p>
                  <p className="text-sm font-semibold">
                    {aiCondition.breakdown[key]?.score ?? '—'}
                  </p>
                </div>
              ))}
            </div>
            {aiCondition.listing_tip ? (
              <>
                <div className="border-t border-border" />
                <p className="text-sm text-muted-foreground border-l-2 border-accent pl-3">
                  {aiCondition.listing_tip}
                </p>
              </>
            ) : null}
            {isUsed && !conditionOverridden && aiCondition.grade !== form.condition ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={applyAiGrade}
                  className="rounded-full bg-accent text-accent-foreground text-sm font-medium px-4 py-1.5 hover:bg-accent/90"
                >
                  Apply grade: {gradeDisplay(aiCondition.grade)} ✓
                </button>
                <button
                  type="button"
                  onClick={overrideCondition}
                  className="rounded-full border border-border text-sm px-4 py-1.5 text-muted-foreground hover:border-accent/50"
                >
                  Override
                </button>
              </div>
            ) : isUsed && !conditionOverridden && aiCondition.grade === form.condition ? (
              <p className="text-xs text-muted-foreground">
                Wear grade applied: {gradeDisplay(form.condition)}
              </p>
            ) : isUsed && conditionOverridden ? (
              <p className="text-xs text-muted-foreground">Pick condition manually below.</p>
            ) : null}
          </div>
        ) : null}

        {pricing && !isCollection ? <AiSpinner label="Checking market prices…" /> : null}

        {aiPrice && !pricing && !isCollection && (wizardStep === 'condition' || wizardStep === 'review') ? (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-accent" />
              <span>Guild Market value</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg border border-border px-2 py-3">
                <p className="text-[10px] text-muted-foreground mb-1">Quick sale</p>
                <p className="font-semibold">${Math.round(aiPrice.suggested_low_cents / 100)}</p>
              </div>
              <div className="rounded-lg border-2 border-accent px-2 py-3">
                <p className="text-[10px] text-muted-foreground mb-1">Market avg</p>
                <p className="font-semibold text-accent">${midPrice}</p>
              </div>
              <div className="rounded-lg border border-border px-2 py-3">
                <p className="text-[10px] text-muted-foreground mb-1">Patient seller</p>
                <p className="font-semibold">${Math.round(aiPrice.suggested_high_cents / 100)}</p>
              </div>
            </div>
            <SimilarSalesGuidance comps={aiPrice.comps} />
            <p className="text-[11px] text-muted-foreground text-center">
              {priceGuidanceFooter(aiPrice.comps)}
            </p>
            <p className="text-[11px] text-muted-foreground">{aiPrice.confidence_note}</p>
            <button
              type="button"
              onClick={applySuggestedPrice}
              className="rounded-full bg-accent text-accent-foreground text-sm font-medium px-4 py-1.5 hover:bg-accent/90"
            >
              Use ${midPrice} →
            </button>
          </div>
        ) : null}

        {images.length > 0 && agentLoading ? (
          <AiSpinner label="Writing listing description…" />
        ) : null}
      </section>

      {/* —— 2. Shoe details —— */}
      <section
        className={cn(
          'rounded-xl border border-border bg-card p-4 space-y-4',
          wizardStep !== 'confirm' && wizardStep !== 'condition' && 'hidden'
        )}
        aria-label="Shoe details"
      >
        <h2 className="text-sm font-semibold text-foreground">Shoe details</h2>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Condition type</Label>
          <div className="grid grid-cols-3 gap-2">
            {WEAR_STATE_OPTIONS.map((opt) => {
              const short =
                opt.value === 'bnib'
                  ? 'BNIB'
                  : opt.value === 'new_no_box'
                    ? 'New'
                    : 'Used';
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWearState(opt.value)}
                  className={cn(
                    'rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors touch-manipulation',
                    form.wear_state === opt.value
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border text-muted-foreground hover:border-accent/40'
                  )}
                >
                  {short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Brand</Label>
            <MarketBrandSelect
              className="w-full mt-1 rounded-lg border bg-background px-3 py-2.5 text-sm h-11 border-input"
              value={form.brand}
              brands={brandOptions}
              isAdmin={isAdmin}
              onBrandAdded={(_brand, brands) => setBrandOptions(brands)}
              onChange={(brand) => {
                handleIdentityFieldEdit();
                setForm((f) => ({ ...f, brand, rarity: '' }));
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Model</Label>
            <Input
              className="mt-1 h-11"
              value={form.model}
              onChange={(e) => {
                handleIdentityFieldEdit();
                setForm((f) => ({ ...f, model: e.target.value, rarity: '' }));
              }}
              placeholder="JB Elite III"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Colorway (optional)</Label>
          <Input
            className="mt-1 h-11"
            value={form.colorway}
            onChange={(e) => setForm({ ...form, colorway: e.target.value })}
            onBlur={() => {
              setForm((f) => {
                if (f.color_family) return f;
                const inferred = inferColorFamilyFromColorway(f.colorway.trim());
                return inferred ? { ...f, color_family: inferred } : f;
              });
            }}
            placeholder="Marsteller, David Taylor, Cherry…"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg shrink-0"
            disabled={identitySaving || !form.model.trim()}
            onClick={() => void saveShoeIdentity()}
          >
            {identitySaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving…
              </>
            ) : (
              'Refresh AI from corrected details'
            )}
          </Button>
          {identitySavedFlash ? (
            <span className="text-xs text-accent font-medium">
              Saved — catalog, condition, and description updated
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Correct brand/model/colorway first — AI will re-check history, condition, price, and description
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {isBnibInventory ? (
            <div className="col-span-2">
              <BnibSizeInventoryEditor rows={sizeInventory} onChange={setSizeInventory} />
            </div>
          ) : (
            <div>
              <Label className="text-xs">{formatMarketShoeSizeFieldLabel()}</Label>
              <ShoeSizeSelect
                className="mt-1"
                value={form.size}
                onChange={(size) => setForm({ ...form, size })}
              />
              <UsedListingSizeNote className="mt-1.5" />
            </div>
          )}
          {isUsed ? (
            <div>
              <Label className="text-xs">Wear grade</Label>
              <select
                className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm h-11"
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
              >
                {USED_CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <Label className="text-xs">Year (optional)</Label>
              <Input
                className="mt-1 h-11"
                value={form.model_year}
                onChange={(e) =>
                  setForm({ ...form, model_year: e.target.value.replace(/\D/g, '').slice(0, 4) })
                }
                placeholder="2016"
                inputMode="numeric"
              />
            </div>
          )}
        </div>

        {isUsed ? (
          <div>
            <Label className="text-xs">Year (optional)</Label>
            <Input
              className="mt-1 h-11"
              value={form.model_year}
              onChange={(e) =>
                setForm({ ...form, model_year: e.target.value.replace(/\D/g, '').slice(0, 4) })
              }
              placeholder="2016"
              inputMode="numeric"
            />
          </div>
        ) : null}

        <div>
          <Label className="text-xs">Weight class (optional)</Label>
          <Input
            className="mt-1 h-11"
            value={form.weight_class}
            onChange={(e) => setForm({ ...form, weight_class: e.target.value })}
            placeholder="e.g. 9 oz — AI fills when known"
          />
        </div>

        <ListingRarityField
          rarity={form.rarity}
          isAdmin={isAdmin}
          assessing={analyzing || identifyingShoe || catalogEnriching}
          onChange={(rarity) => setForm((f) => ({ ...f, rarity }))}
        />
      </section>

      {/* —— 3. How to list —— */}
      <section
        className={cn('space-y-3', wizardStep !== 'review' && 'hidden')}
        aria-label="Listing type"
      >
        <h2 className="text-sm font-semibold text-foreground">How should this show up?</h2>
        <div className="grid grid-cols-2 gap-2">
          {SELLER_LISTING_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setListingType(opt.value)}
              className={cn(
                'text-left rounded-xl border px-3 py-3 transition-colors touch-manipulation min-h-[72px]',
                form.listing_type === opt.value
                  ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                  : 'border-border bg-card hover:border-accent/40'
              )}
            >
              <p className="text-sm font-medium text-foreground">{opt.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                {opt.hint}
              </p>
            </button>
          ))}
        </div>
        {form.listing_type === 'sell' ? (
          <div className="space-y-2">
            <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 cursor-pointer touch-manipulation">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
                checked={form.open_to_trade}
                onChange={(e) => setForm((f) => ({ ...f, open_to_trade: e.target.checked }))}
              />
              <span className="text-sm text-foreground">Also open to trades</span>
            </label>
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-3">
              <div>
                <p className="text-sm text-foreground">Accept offers</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  On by default — buyers can offer below your list price
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.accepts_offers}
                onClick={() => setForm((f) => ({ ...f, accepts_offers: !f.accepts_offers }))}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors shrink-0',
                  form.accepts_offers ? 'bg-accent' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                    form.accepts_offers ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
          </div>
        ) : null}
        {isCollection ? (
          <>
            <CollectionPurchaseNotesFields notes={purchaseNotes} onChange={setPurchaseNotes} />
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-3">
              <div>
                <p className="text-sm text-foreground">Accept offers</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Let buyers make unsolicited offers on pairs in your collection
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.accepts_offers}
                onClick={() => setForm((f) => ({ ...f, accepts_offers: !f.accepts_offers }))}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors shrink-0',
                  form.accepts_offers ? 'bg-accent' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                    form.accepts_offers ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
          </>
        ) : null}
      </section>

      {/* —— 4. Price & description —— */}
      <section
        className={cn(
          'space-y-4',
          wizardStep !== 'condition' && wizardStep !== 'review' && 'hidden'
        )}
        aria-label="Price and description"
      >
        {isPricedListing ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Price ($)</Label>
              <Input
                className="mt-1 h-11"
                value={form.price_cents}
                onChange={(e) => setForm({ ...form, price_cents: e.target.value })}
                inputMode="decimal"
                placeholder="120"
              />
            </div>
            <div>
              <Label className="text-xs">Shipping ($)</Label>
              <Input
                className="mt-1 h-11"
                value={form.shipping_cents}
                onChange={(e) => setForm({ ...form, shipping_cents: e.target.value })}
                inputMode="decimal"
              />
            </div>
          </div>
        ) : form.listing_type === 'trade' ? (
          <p className="text-sm text-muted-foreground rounded-xl border border-border bg-card/60 px-3 py-3">
            Trade only — buyers propose shoes from their listings.
          </p>
        ) : null}
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Description (optional)</Label>
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
            className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
            value={form.description}
            onChange={(e) => {
              if (agentLoading) descriptionEditedDuringAgentRef.current = true;
              setDescriptionTouched(true);
              descriptionTouchedRef.current = true;
              setAiDescriptionDraft(false);
              setForm((f) => ({ ...f, description: e.target.value }));
            }}
            placeholder={
              form.model.trim()
                ? 'What buyers see — or tap Generate with AI'
                : 'Add model above, or let AI draft after photos'
            }
          />
          {agentReply && !form.description.includes(agentReply) ? (
            <p className="text-xs text-destructive mt-1">{agentReply}</p>
          ) : null}
          {agentExpanded ? (
            <div className="mt-2 space-y-2">
              <Input
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                placeholder="Optional note for AI"
                disabled={agentLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitAgent();
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAgentExpanded(true)}
              className="text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              + Note for AI
            </button>
          )}
        </div>

        <div>
          <Label className="text-xs">Collector notes (optional)</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">
            Release history, PE story, or catalog context — shown to buyers below the description.
          </p>
          <textarea
            className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.collector_notes}
            onChange={(e) => setForm((f) => ({ ...f, collector_notes: e.target.value }))}
            placeholder="e.g. David Taylor PE — limited run for Penn State wrestlers…"
          />
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {wizardStep === 'review' ? (
        <Button
          className="w-full min-h-[52px] rounded-xl bg-accent text-accent-foreground font-semibold text-base touch-manipulation"
          onClick={publish}
          disabled={uploading || analyzing || identifyingShoe}
        >
          {isCollection ? 'Add to collection' : 'Publish listing'}
        </Button>
      ) : (
        <Button
          className="w-full min-h-[52px] rounded-xl bg-accent text-accent-foreground font-semibold text-base touch-manipulation"
          onClick={continueWizard}
          disabled={!canContinueWizard}
        >
          {nextWizardLabel}
        </Button>
      )}

      <p className="text-xs text-muted-foreground">{SELLER_AI_DISCLAIMER}</p>
    </div>
  );
}
