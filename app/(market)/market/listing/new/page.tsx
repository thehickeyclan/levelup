'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackLink } from '@/components/back-link';
import { SELLER_AI_DISCLAIMER } from '@/lib/market/ai/prompts';
import { buildListingDescription, buildListingAgentPrompt } from '@/lib/market/listing-description';
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
  enrichmentFromShoeIdResult,
  type ListingEnrichment,
} from '@/lib/market/catalog-listing-enrich';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';
import { MARKET_BRANDS, normalizeMarketBrand } from '@/lib/market/brands';
import { ListingRarityField } from '@/components/market/listing-rarity-field';
import { normalizeMarketRarity, type MarketRarity } from '@/lib/market/rarity';
import type { PriceComp } from '@/lib/market/ai/schemas';
import type { MarketListingImageRow } from '@/lib/market/listing-images';
import { prepareListingPhotos } from '@/lib/market/prepare-listing-photo';
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
import { supportsMultiSizeInventory } from '@/lib/market/listing-sizes';

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

function enrichmentToFormPatch(
  enrichment: ListingEnrichment,
  current: {
    brand: string;
    model: string;
    colorway: string;
    color_family: string;
    model_year: string;
    rarity: MarketRarity | '';
    weight_class: string;
  },
  opts?: { colorwayOnly?: boolean; fillEmptyOnly?: boolean }
) {
  const patch: Partial<typeof current> = {};
  const fillEmpty = opts?.fillEmptyOnly ?? false;

  if (!opts?.colorwayOnly) {
    if (enrichment.brand && (!fillEmpty || !current.brand.trim())) {
      patch.brand = normalizeMarketBrand(enrichment.brand);
    }
    if (enrichment.model && (!fillEmpty || !current.model.trim())) {
      patch.model = enrichment.model.trim();
    }
    if (
      enrichment.model_year != null &&
      enrichment.model_year > 0 &&
      (!fillEmpty || !current.model_year)
    ) {
      patch.model_year = String(enrichment.model_year);
    }
    if (enrichment.weight_class && (!fillEmpty || !current.weight_class.trim())) {
      patch.weight_class = enrichment.weight_class;
    }
    if (enrichment.rarity && (!fillEmpty || !current.rarity)) {
      patch.rarity = enrichment.rarity;
    }
  }

  const cw = enrichment.colorway?.trim() || '';
  if (cw && (!fillEmpty || !current.colorway.trim())) {
    patch.colorway = cw;
    patch.color_family = inferColorFamilyFromColorway(cw) || current.color_family;
  } else if (
    enrichment.color_family &&
    (!fillEmpty || !current.color_family.trim())
  ) {
    patch.color_family = enrichment.color_family;
  }

  return patch;
}

function gradeDisplay(grade: string) {
  return grade.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function conditionGradeFromAnalysis(
  wearState: MarketWearState,
  grade: string | undefined
): string | null {
  if (wearState !== 'used' || !grade) return null;
  if (!(USED_CONDITIONS as readonly string[]).includes(grade)) return null;
  return grade;
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
    typeParam === 'collection' ||
    typeParam === 'vault' ||
    typeParam === 'trade' ||
    typeParam === 'sell'
      ? typeParam
      : 'sell';

  const [listingId, setListingId] = useState<string | null>(null);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [identifyingShoe, setIdentifyingShoe] = useState(false);
  const [catalogEnriching, setCatalogEnriching] = useState(false);
  const [shoeIdResult, setShoeIdResult] = useState<ShoeIdResult | null>(null);
  const [shoeIdAutoApplied, setShoeIdAutoApplied] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiCondition, setAiCondition] = useState<AiCondition | null>(null);
  const [aiPrice, setAiPrice] = useState<AiPrice | null>(null);
  const [conditionOverridden, setConditionOverridden] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [aiDescriptionDraft, setAiDescriptionDraft] = useState(false);

  const [agentExpanded, setAgentExpanded] = useState(false);
  const [agentInput, setAgentInput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentReply, setAgentReply] = useState<string | null>(null);

  const [purchaseNotes, setPurchaseNotes] = useState<CollectionPurchaseNotes>(
    emptyCollectionPurchaseNotes()
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [sizeInventory, setSizeInventory] = useState<SizeInventoryRow[]>([
    emptySizeInventoryRow('10'),
  ]);

  const lastAutoKey = useRef<string | null>(null);
  const pipelineRunning = useRef(false);
  const catalogEnrichTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCatalogEnrichKey = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    price_cents: '',
    shipping_cents: '10',
    description: '',
    rarity: '' as MarketRarity | '',
    weight_class: '',
  });

  const sellerPrefillDone = useRef(false);

  useEffect(() => {
    if (sellerPrefillDone.current) return;
    sellerPrefillDone.current = true;
    void (async () => {
      try {
        const res = await fetch('/api/market/seller-shoe-hints');
        const data = await res.json();
        if (res.ok) setIsAdmin(Boolean(data.isAdmin));
        if (!res.ok || !data.dominantListing) return;
        const d = data.dominantListing as {
          brand: string;
          model: string;
          model_year: number | null;
        };
        setForm((f) => ({
          ...f,
          brand: normalizeMarketBrand(d.brand),
          model: f.model.trim() ? f.model : d.model,
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

  const setListingType = (listingType: MarketListingType) => {
    setForm((f) => ({
      ...f,
      listing_type: listingType,
      open_to_trade: listingType === 'sell' ? f.open_to_trade : false,
      price_cents: listingType === 'sell' ? f.price_cents : '',
      shipping_cents:
        listingType === 'collection' || listingType === 'vault' ? '0' : f.shipping_cents,
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
  };

  const ensureDraft = async () => {
    if (listingId) return listingId;
    const res = await fetch('/api/market/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft: true,
        listing_type: form.listing_type,
        wear_state: form.wear_state,
        brand: form.brand,
        model: form.model.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create draft');
    setListingId(data.listingId);
    return data.listingId as string;
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? []);
    if (!rawFiles.length) return;
    setError(null);
    setUploadError(null);
    setUploading(true);
    try {
      let files: File[];
      try {
        setUploadProgress('Preparing photos…');
        files = await prepareListingPhotos(rawFiles);
      } catch {
        throw new Error(
          'Could not read these photos. If they are iPhone HEIC, try Settings → Camera → Formats → Most Compatible.'
        );
      }

      const id = await ensureDraft();
      let order = images.length;
      const uploaded: ListingImage[] = [];

      for (let i = 0; i < files.length; i++) {
        if (order >= MAX_PHOTOS) {
          setUploadError(`Maximum ${MAX_PHOTOS} photos per listing.`);
          break;
        }
        setUploadProgress(`Uploading ${i + 1} of ${files.length}…`);
        const fd = new FormData();
        fd.append('file', files[i]);
        fd.append('display_order', String(order));
        const res = await fetch(`/api/market/listings/${id}/images`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        if (data.image) {
          uploaded.push(data.image as ListingImage);
          order += 1;
        }
      }

      if (!uploaded.length) {
        throw new Error('No photos uploaded — try again.');
      }

      setImages((prev) =>
        [...prev, ...uploaded].sort((a, b) => a.display_order - b.display_order)
      );
      setAiCondition(null);
      setAiPrice(null);
      setConditionOverridden(false);
      setShoeIdResult(null);
      setShoeIdAutoApplied(false);
      lastAutoKey.current = null;
      lastCatalogEnrichKey.current = null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(msg);
      setError(msg);
    } finally {
      setUploading(false);
      setUploadProgress(null);
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
      description: merged.description,
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

  const agentPromptInput = (sellerNote?: string, overrides?: Partial<typeof form>) => {
    const merged = { ...form, ...overrides };
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
      collectorNotes: shoeIdResult?.collector_notes?.trim() || null,
      sellerNote,
      conditionAnalysis: aiCondition,
    };
  };

  const generateDescription = useCallback(
    async (opts?: { sellerNote?: string; silent?: boolean; overrides?: Partial<typeof form> }) => {
      const merged = { ...form, ...opts?.overrides };
      if (!merged.model.trim()) {
        if (!opts?.silent) {
          setError('Add a model (or use Shoe ID) before generating a description.');
        }
        return;
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
                content: buildListingAgentPrompt(agentPromptInput(opts?.sellerNote, opts?.overrides)),
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
          setAiDescriptionDraft(true);
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
    async (id: string, overrides?: Partial<typeof form>) => {
      const merged = { ...form, ...overrides };
      const brand = merged.brand.trim();
      const model = merged.model.trim();
      if (!brand || !model) return;
      if (normalizeMarketRarity(merged.rarity)) return;

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
          if (rarity) setForm((f) => ({ ...f, rarity }));
        }
      } catch {
        // Non-fatal — seller can set rarity manually
      }
    },
    [form]
  );

  const runCatalogEnrich = useCallback(
    async (overrides?: Partial<typeof form>): Promise<Partial<typeof form>> => {
      const merged = { ...form, ...overrides };
      const brand = merged.brand.trim();
      const model = merged.model.trim();
      if (!brand || model.length < 2) return {};

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
        if (!res.ok) return {};

        const enrichment: ListingEnrichment = {
          model_year: data.model_year ?? undefined,
          weight_class: data.weight_class ?? undefined,
          rarity: data.rarity ? normalizeMarketRarity(data.rarity) ?? undefined : undefined,
        };
        const patch = enrichmentToFormPatch(enrichment, merged, { fillEmptyOnly: true });
        if (Object.keys(patch).length) mergeFormPatch(patch);
        return patch;
      } catch {
        return {};
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, mergeFormPatch, listingId]
  );

  const runPhotoCondition = useCallback(
    async (
      id: string,
      overrides?: Partial<typeof form>
    ): Promise<Partial<typeof form>> => {
      if (images.length === 0) return {};

      const merged = { ...form, ...overrides };
      try {
        const res = await fetch('/api/market/ai/condition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: id, wear_state: merged.wear_state }),
        });
        const data = await res.json();
        if (!res.ok) return {};

        const analysis = data.analysis as AiCondition;
        setAiCondition(analysis);
        setConditionOverridden(false);

        const autoGrade = conditionGradeFromAnalysis(merged.wear_state, analysis.grade);
        if (autoGrade) {
          mergeFormPatch({ condition: autoGrade });
          return { condition: autoGrade };
        }
      } catch {
        // Non-fatal — catalog and description can still run
      }
      return {};
    },
    [form, images, mergeFormPatch]
  );

  const runCondition = useCallback(async () => {
    if (pipelineRunning.current) return;
    pipelineRunning.current = true;
    setAnalyzing(true);
    setError(null);
    let overrides: Partial<typeof form> = {};
    const formBase = () => ({ ...form, ...overrides });
    try {
      const id = await ensureDraft();

      if (images.length > 0) {
        setIdentifyingShoe(true);
        try {
          const res = await fetch('/api/market/shoe-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listingId: id,
              images: images.map((i) => i.public_url),
              brandHint: form.brand.trim() || undefined,
              modelHint: form.model.trim() || undefined,
            }),
          });
          const data = await res.json();
          if (res.ok && data.result) {
            const result = data.result as ShoeIdResult;
            setShoeIdResult(result);
            const colorFamily =
              inferColorFamilyFromColorway(result.colorway?.trim() || '') || '';
            const catalogExtra = data.catalogEnrichment as ListingEnrichment | null | undefined;
            const enrichment = enrichmentFromShoeIdResult(result, colorFamily);
            const mergedEnrichment: ListingEnrichment = {
              ...enrichment,
              model_year: enrichment.model_year ?? catalogExtra?.model_year ?? undefined,
              weight_class: catalogExtra?.weight_class ?? enrichment.weight_class,
              rarity: enrichment.rarity ?? catalogExtra?.rarity ?? undefined,
            };
            const shoeOverrides = enrichmentToFormPatch(mergedEnrichment, formBase());
            overrides = { ...overrides, ...shoeOverrides };
            mergeFormPatch(shoeOverrides);
            setShoeIdAutoApplied(true);
            setUploadError(null);
            lastCatalogEnrichKey.current = `${formBase().brand.trim()}|${formBase().model.trim()}`;
          }
        } catch {
          // Non-fatal — condition analysis can still run
        } finally {
          setIdentifyingShoe(false);
        }
      }

      const catalogPatch = await runCatalogEnrich(overrides);
      overrides = { ...overrides, ...catalogPatch };

      await fetch(`/api/market/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload(overrides)),
      });

      const conditionPatch = await runPhotoCondition(id, overrides);
      overrides = { ...overrides, ...conditionPatch };

      const listingType = formBase().listing_type;
      if (listingType !== 'collection') {
        await runPrice(overrides);
      }
      await runRarity(id, overrides);

      const modelAfterId = formBase().model.trim();
      if (!descriptionTouched && !form.description.trim() && modelAfterId) {
        await generateDescription({ silent: true, overrides });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
      pipelineRunning.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.wear_state,
    form.listing_type,
    form.model,
    form.description,
    listingId,
    images,
    runPrice,
    descriptionTouched,
    generateDescription,
    runRarity,
    mergeFormPatch,
    runCatalogEnrich,
    runPhotoCondition,
  ]);

  useEffect(() => {
    if (!imageKey || uploading || analyzing || identifyingShoe || pipelineRunning.current) return;
    const key = `${imageKey}|${form.wear_state}`;
    if (lastAutoKey.current === key) return;

    const timer = setTimeout(() => {
      lastAutoKey.current = key;
      void runCondition();
    }, 600);

    return () => clearTimeout(timer);
  }, [imageKey, form.wear_state, uploading, analyzing, identifyingShoe, runCondition]);

  useEffect(() => {
    const brand = form.brand.trim();
    const model = form.model.trim();
    if (!brand || model.length < 3) return;
    if (uploading || analyzing || identifyingShoe || pipelineRunning.current || catalogEnriching) return;

    const key = `${brand}|${model}`;
    if (lastCatalogEnrichKey.current === key) return;

    if (catalogEnrichTimer.current) clearTimeout(catalogEnrichTimer.current);
    catalogEnrichTimer.current = setTimeout(() => {
      lastCatalogEnrichKey.current = key;
      void (async () => {
        setCatalogEnriching(true);
        try {
          const patch = await runCatalogEnrich();
          const id = listingId ?? await ensureDraft();
          let overrides: Partial<typeof form> = { ...patch };

          await fetch(`/api/market/listings/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draftPayload(overrides)),
          });

          if (images.length > 0) {
            const conditionPatch = await runPhotoCondition(id, overrides);
            overrides = { ...overrides, ...conditionPatch };
            if (overrides.condition) {
              await fetch(`/api/market/listings/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draftPayload(overrides)),
              });
            }
          }

          await runRarity(id, overrides);

          const listingType = overrides.listing_type ?? form.listing_type;
          if (listingType !== 'collection' && images.length > 0) {
            await runPrice(overrides);
          }

          if (
            !descriptionTouched &&
            !form.description.trim() &&
            (overrides.model?.trim() || model)
          ) {
            await generateDescription({ silent: true, overrides });
          }
        } finally {
          setCatalogEnriching(false);
        }
      })();
    }, 900);

    return () => {
      if (catalogEnrichTimer.current) clearTimeout(catalogEnrichTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.brand,
    form.model,
    uploading,
    analyzing,
    identifyingShoe,
    catalogEnriching,
    descriptionTouched,
    form.description,
    runCatalogEnrich,
    runRarity,
    generateDescription,
    runPhotoCondition,
    runPrice,
    images.length,
    listingId,
  ]);

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
      const description =
        form.description.trim() || buildListingDescription(descriptionInput());
      const priceNum =
        form.listing_type === 'sell'
          ? Math.round(Number(form.price_cents || 0) * 100)
          : null;
      const shipNum =
        form.listing_type === 'collection'
          ? 0
          : Math.round(Number(form.shipping_cents || 0) * 100);

      await fetch(`/api/market/listings/${id}`, {
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

      await saveSizeInventory(id);

      if (!form.rarity) {
        await fetch('/api/market/ai/rarity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId: id, persist: true }),
        });
      }

      router.push(`/market/listing/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const midPrice = aiPrice ? Math.round(aiPrice.suggested_mid_cents / 100) : 0;

  return (
    <div className="min-h-screen pb-28 px-4 pt-4 max-w-lg mx-auto space-y-5">
      <BackLink
        fallbackHref={isCollection ? '/market/my-listings' : '/market'}
        label={isCollection ? 'My pairs' : 'Back to Market'}
      />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {isCollection ? 'Add to your closet' : 'List a pair'}
        </h1>
        <p className="text-sm text-muted-foreground leading-snug">
          {isCollection
            ? 'Photo first — AI fills brand, condition, and rarity. Tap anything to change it.'
            : 'Add a photo first. AI helps with the details — you stay in control.'}
        </p>
      </header>

      {/* —— 1. Photos + AI —— */}
      <section className="space-y-3" aria-label="Photos">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Photos</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
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
        {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
        {images.length > 0 && listingId ? (
          <ListingPhotoGrid
            listingId={listingId}
            images={images}
            onImagesChange={setImages}
            onUpdateImage={updateImage}
          />
        ) : null}

        {listingId && images.length > 0 ? (
          <ShoeIdCard
            listingId={listingId}
            images={images}
            externalResult={shoeIdResult}
            externalLoading={identifyingShoe}
            autoApplied={shoeIdAutoApplied}
            userLocked={false}
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
                setShoeIdAutoApplied(true);
                lastCatalogEnrichKey.current = `${shoeOverrides.brand?.trim() ?? form.brand}|${shoeOverrides.model?.trim() ?? form.model}`;
              }
              if (form.listing_type !== 'collection') {
                void runPrice(shoeOverrides);
              } else if (listingId) {
                void runRarity(listingId, shoeOverrides);
              }
              if (!descriptionTouched && !form.description.trim()) {
                void generateDescription({ silent: true, overrides: shoeOverrides });
              }
            }}
          />
        ) : null}

        {images.length > 0 && identifyingShoe ? (
          <AiSpinner label="AI recognizing brand, model, and colorway…" />
        ) : null}

        {images.length > 0 && analyzing && !identifyingShoe ? (
          <AiSpinner label="AI grading condition, rarity, and writing description…" />
        ) : null}

        {catalogEnriching && !analyzing && !identifyingShoe ? (
          <AiSpinner
            label={
              images.length > 0
                ? 'AI looking up details, grading condition, and writing description…'
                : 'AI looking up shoe details…'
            }
          />
        ) : null}

        {aiCondition && !analyzing ? (
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

        {aiPrice && !pricing && !isCollection ? (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-accent" />
              <span>Market price range</span>
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
        className="rounded-xl border border-border bg-card p-4 space-y-4"
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
            <select
              className="w-full mt-1 rounded-lg border bg-background px-3 py-2.5 text-sm h-11 border-input"
              value={form.brand}
              onChange={(e) => {
                lastCatalogEnrichKey.current = null;
                setForm({ ...form, brand: e.target.value, rarity: '' });
              }}
            >
              {MARKET_BRANDS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Model</Label>
            <Input
              className="mt-1 h-11"
              value={form.model}
              onChange={(e) => {
                lastCatalogEnrichKey.current = null;
                setForm({ ...form, model: e.target.value, rarity: '' });
              }}
              onBlur={() => {
                if (
                  !descriptionTouched &&
                  !form.description.trim() &&
                  form.model.trim() &&
                  aiCondition
                ) {
                  void generateDescription({ silent: true });
                }
              }}
              placeholder="JB Elite III"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {isBnibInventory ? (
            <div className="col-span-2">
              <BnibSizeInventoryEditor rows={sizeInventory} onChange={setSizeInventory} />
            </div>
          ) : (
            <div>
              <Label className="text-xs">Size (US)</Label>
              <Input
                className="mt-1 h-11"
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                inputMode="decimal"
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
              if (!isCollection && images.length > 0 && !pricing) void runPrice();
            }}
            placeholder="Cherry, Black/Gold…"
          />
        </div>
      </section>

      {/* —— 3. How to list —— */}
      <section className="space-y-3" aria-label="Listing type">
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
          <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 cursor-pointer touch-manipulation">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
              checked={form.open_to_trade}
              onChange={(e) => setForm((f) => ({ ...f, open_to_trade: e.target.checked }))}
            />
            <span className="text-sm text-foreground">Also open to trades</span>
          </label>
        ) : null}
        {isCollection ? (
          <CollectionPurchaseNotesFields notes={purchaseNotes} onChange={setPurchaseNotes} />
        ) : null}
      </section>

      {/* —— 4. Price & description —— */}
      <section className="space-y-4" aria-label="Price and description">
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
              setDescriptionTouched(true);
              setAiDescriptionDraft(false);
              setForm({ ...form, description: e.target.value });
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
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        className="w-full min-h-[52px] rounded-xl bg-accent text-accent-foreground font-semibold text-base touch-manipulation"
        onClick={publish}
        disabled={uploading || analyzing || identifyingShoe}
      >
        {isCollection ? 'Add to closet' : 'Publish listing'}
      </Button>

      <p className="text-xs text-muted-foreground">{SELLER_AI_DISCLAIMER}</p>
    </div>
  );
}
