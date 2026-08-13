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
import { buildListingAgentPrompt, resolveListingDescriptionForSave } from '@/lib/market/listing-description';
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
  conditionGradeFromAnalysis,
  enrichmentToFormPatch,
} from '@/lib/market/listing-enrichment-form';
import type { ListingEnrichment } from '@/lib/market/catalog-listing-enrich';
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

type AiCondition = {
  wrestle_score: number;
  grade: string;
  breakdown: Partial<Record<(typeof BREAKDOWN_KEYS)[number], { score: number; note: string }>>;
  listing_tip?: string;
  summary?: string;
  cosmetic_summary?: string;
};

function gradeDisplay(grade: string) {
  return grade.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const EDITABLE_STATUSES = new Set(['active', 'draft', 'archived']);

type ListingImage = MarketListingImageRow & { id: string };

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
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identitySavedFlash, setIdentitySavedFlash] = useState(false);
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
  const [analyzing, setAnalyzing] = useState(false);
  const [catalogEnriching, setCatalogEnriching] = useState(false);
  const [aiCondition, setAiCondition] = useState<AiCondition | null>(null);
  const [conditionOverridden, setConditionOverridden] = useState(false);
  const [catalogCollectorNotes, setCatalogCollectorNotes] = useState<string | null>(null);
  const [catalogUpperMaterial, setCatalogUpperMaterial] = useState<string | null>(null);
  const [catalogSoleDescription, setCatalogSoleDescription] = useState<string | null>(null);
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
  const descriptionTouchedRef = useRef(false);
  const descriptionEditedDuringAgentRef = useRef(false);
  const photosDirtyRef = useRef(false);
  const pipelineRunning = useRef(false);
  const conditionAutoKey = useRef<string | null>(null);

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
    accepts_offers: true,
    price_cents: '',
    shipping_cents: '10',
    description: '',
    collector_notes: '',
    rarity: '' as MarketRarity | '',
    weight_class: '',
  });

  useEffect(() => {
    descriptionTouchedRef.current = descriptionTouched;
  }, [descriptionTouched]);

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
        const rawType = String(l.listing_type ?? 'collection');
        setForm({
          brand: resolvedBrand,
          model: String(l.model ?? ''),
          colorway: String(l.colorway ?? ''),
          color_family: String(l.color_family ?? ''),
          model_year: l.model_year ? String(l.model_year) : '',
          size: String(l.size ?? '10'),
          wear_state: wear,
          condition: String(l.condition ?? 'good'),
          listing_type: rawType === 'vault' ? 'collection' : ((rawType as MarketListingType) || 'collection'),
          open_to_trade: Boolean(l.open_to_trade),
          accepts_offers:
            rawType === 'vault' ||
            rawType === 'collection' ||
            rawType === 'sell'
              ? l.accepts_offers !== false
              : Boolean(l.accepts_offers),
          price_cents:
            l.price_cents != null ? String(Math.round(Number(l.price_cents) / 100)) : '',
          shipping_cents:
            l.shipping_cents != null ? String(Math.round(Number(l.shipping_cents) / 100)) : '10',
          description: String(l.description ?? ''),
          collector_notes: String(l.collector_notes ?? ''),
          rarity: normalizeMarketRarity(l.rarity as string | null) ?? '',
          weight_class: String(l.weight_class ?? ''),
        });
        const aiRaw = l.market_ai_analysis;
        const aiRow = (Array.isArray(aiRaw) ? aiRaw[0] : aiRaw) as {
          condition_score?: number;
          condition_grade_suggested?: string;
          condition_breakdown?: AiCondition['breakdown'];
          listing_tip?: string;
          condition_summary?: string;
          cosmetic_summary?: string;
        } | null | undefined;
        if (wear === 'used' && aiRow?.condition_score != null && aiRow.condition_grade_suggested) {
          setAiCondition({
            wrestle_score: Number(aiRow.condition_score),
            grade: aiRow.condition_grade_suggested,
            breakdown: (aiRow.condition_breakdown as AiCondition['breakdown']) ?? {},
            listing_tip: aiRow.listing_tip,
            summary: aiRow.condition_summary,
            cosmetic_summary: aiRow.cosmetic_summary,
          });
        }
        setPurchaseNotes(collectionPurchaseNotesFromListing(l));
        const loadedSizes = (data.sizes as { size_us: number; quantity: number }[] | undefined) ?? [];
        if (supportsMultiSizeInventory(wear) && loadedSizes.length) {
          setSizeInventory(
            loadedSizes.map((row) => ({
              size_us: String(row.size_us),
              quantity: String(row.quantity),
            }))
          );
        } else if (supportsMultiSizeInventory(wear)) {
          setSizeInventory([emptySizeInventoryRow(String(l.size ?? '10'))]);
        } else {
          setSizeInventory([emptySizeInventoryRow(String(l.size ?? '10'))]);
        }
        if (String(l.description ?? '').trim()) {
          setDescriptionTouched(true);
          descriptionTouchedRef.current = true;
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
      accepts_offers:
        form.listing_type === 'collection' || form.listing_type === 'sell'
          ? form.accepts_offers !== false
          : false,
      description: form.description,
      collector_notes: form.collector_notes.trim() || null,
      price_cents:
        form.listing_type === 'sell'
          ? Math.round(Number(form.price_cents || 0) * 100)
          : null,
      shipping_cents:
        form.listing_type === 'collection'
          ? 0
          : Math.round(Number(form.shipping_cents || 0) * 100),
      rarity: form.rarity || null,
      weight_class: form.weight_class.trim() || null,
      ...collectionPurchaseNotesToPayload(purchaseNotes),
    };
  };

  const runUsedConditionAnalysis = useCallback(
    async (opts?: { silent?: boolean; wearState?: MarketWearState }): Promise<AiCondition | null> => {
      const wearState = opts?.wearState ?? form.wear_state;
      if (wearState !== 'used' || !images.length || !form.model.trim()) return null;

      const autoKey = `${listingId}|${images.map((i) => i.id).join(',')}|${wearState}`;
      if (opts?.silent && conditionAutoKey.current === autoKey) return aiCondition;
      conditionAutoKey.current = autoKey;

      if (!opts?.silent) setAnalyzing(true);
      try {
        const res = await fetch('/api/market/ai/condition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId, wear_state: wearState }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Condition analysis failed');

        const analysis = data.analysis as AiCondition & {
          summary?: string;
          cosmetic_summary?: string;
        };
        const nextCondition: AiCondition = {
          wrestle_score: analysis.wrestle_score,
          grade: analysis.grade,
          breakdown: analysis.breakdown ?? {},
          listing_tip: analysis.listing_tip,
          summary: analysis.summary,
          cosmetic_summary: analysis.cosmetic_summary,
        };
        setAiCondition(nextCondition);
        setConditionOverridden(false);

        const autoGrade = conditionGradeFromAnalysis(wearState, analysis.grade);
        if (autoGrade) {
          setForm((f) => ({ ...f, condition: autoGrade }));
        }
        return nextCondition;
      } catch (err) {
        if (!opts?.silent) {
          setError(err instanceof Error ? err.message : 'Condition analysis failed');
        }
        return null;
      } finally {
        if (!opts?.silent) setAnalyzing(false);
      }
    },
    [aiCondition, form.model, form.wear_state, images, listingId]
  );

  const runIdentityRefreshPipeline = useCallback(
    async (opts?: { refreshDescription?: boolean }) => {
      if (pipelineRunning.current) return;
      const brand = form.brand.trim();
      const model = form.model.trim();
      if (!brand || !model) return;

      pipelineRunning.current = true;
      setAnalyzing(true);
      setCatalogEnriching(true);
      setError(null);

      let merged = { ...form };
      let collectorNotes: string | null = null;

      try {
        const lookupRes = await fetch('/api/market/catalog/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand,
            model,
            colorway: merged.colorway.trim() || null,
            listingId,
            persist: true,
          }),
        });
        const lookupData = await lookupRes.json();
        if (lookupRes.ok) {
          collectorNotes =
            typeof lookupData.collector_notes === 'string' && lookupData.collector_notes.trim()
              ? lookupData.collector_notes.trim()
              : null;
          setCatalogCollectorNotes(collectorNotes);
          setCatalogUpperMaterial(
            typeof lookupData.upper_material === 'string' && lookupData.upper_material.trim()
              ? lookupData.upper_material.trim()
              : null
          );
          setCatalogSoleDescription(
            typeof lookupData.sole_description === 'string' && lookupData.sole_description.trim()
              ? lookupData.sole_description.trim()
              : null
          );

          const enrichment: ListingEnrichment = {
            model_year: lookupData.model_year ?? undefined,
            weight_class: lookupData.weight_class ?? undefined,
            rarity: lookupData.rarity ? normalizeMarketRarity(lookupData.rarity) ?? undefined : undefined,
            colorway:
              typeof lookupData.colorway === 'string' && lookupData.colorway.trim()
                ? lookupData.colorway.trim()
                : undefined,
          };
          const patch = enrichmentToFormPatch(enrichment, merged);
          if (Object.keys(patch).length) {
            merged = { ...merged, ...patch };
            setForm((f) => ({ ...f, ...patch }));
          }
          if (collectorNotes && !merged.collector_notes.trim()) {
            merged = { ...merged, collector_notes: collectorNotes };
            setForm((f) => ({ ...f, collector_notes: collectorNotes! }));
          }
        }

        const colorway = merged.colorway.trim();
        await fetch(`/api/market/listings/${listingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${merged.brand} ${merged.model}`.trim(),
            brand: merged.brand,
            model: merged.model.trim(),
            colorway: colorway || null,
            color_family: resolveColorFamily(merged.color_family, colorway),
            model_year: merged.model_year ? Number(merged.model_year) : null,
            weight_class: merged.weight_class.trim() || null,
            rarity: merged.rarity || null,
            collector_notes: merged.collector_notes.trim() || null,
          }),
        });

        void fetch('/api/market/ai/shoe-about', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listingId,
            brand: merged.brand,
            model: merged.model.trim(),
            modelYear: merged.model_year ? Number(merged.model_year) : null,
          }),
        }).catch(() => {});

        let conditionAnalysis: AiCondition | null = null;
        if (merged.wear_state === 'used' && images.length > 0) {
          conditionAutoKey.current = null;
          conditionAnalysis = await runUsedConditionAnalysis({ silent: true, wearState: 'used' });
          if (conditionAnalysis?.grade) {
            merged = {
              ...merged,
              condition: conditionGradeFromAnalysis('used', conditionAnalysis.grade) ?? merged.condition,
            };
          }
        }

        if (!merged.rarity) {
          const rarityRes = await fetch('/api/market/ai/rarity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listingId,
              brand: merged.brand,
              model: merged.model.trim(),
              colorway: merged.colorway.trim() || null,
              model_year: merged.model_year ? Number(merged.model_year) : null,
              persist: true,
            }),
          });
          const rarityData = await rarityRes.json();
          if (rarityRes.ok && rarityData.rarity) {
            const rarity = normalizeMarketRarity(rarityData.rarity);
            if (rarity) {
              merged = { ...merged, rarity };
              setForm((f) => ({ ...f, rarity }));
            }
          }
        }

        if (opts?.refreshDescription || !descriptionTouchedRef.current) {
          await generateDescription(undefined, {
            silent: true,
            force: Boolean(opts?.refreshDescription),
            formSnapshot: merged,
            collectorNotes,
            conditionAnalysis,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not refresh listing details');
      } finally {
        pipelineRunning.current = false;
        setAnalyzing(false);
        setCatalogEnriching(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, images, listingId, runUsedConditionAnalysis]
  );

  useEffect(() => {
    if (loading || loadError) return;
    if (form.wear_state !== 'used' || !images.length || !form.model.trim() || aiCondition) return;
    void runUsedConditionAnalysis({ silent: true });
  }, [
    loading,
    loadError,
    form.wear_state,
    form.model,
    images,
    aiCondition,
    runUsedConditionAnalysis,
  ]);

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

  const saveShoeIdentity = async () => {
    if (!form.model.trim()) {
      setError('Add a model before saving.');
      return;
    }
    setIdentitySaving(true);
    setIdentitySavedFlash(false);
    setError(null);
    try {
      lockShoeIdentity();
      await runIdentityRefreshPipeline({ refreshDescription: true });
      setIdentitySavedFlash(true);
      window.setTimeout(() => setIdentitySavedFlash(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIdentitySaving(false);
    }
  };

  const generateDescription = async (
    sellerNote?: string,
    opts?: {
      silent?: boolean;
      force?: boolean;
      formSnapshot?: typeof form;
      collectorNotes?: string | null;
      conditionAnalysis?: AiCondition | null;
    }
  ) => {
    const snapshot = opts?.formSnapshot ?? form;
    const conditionForPrompt = opts?.conditionAnalysis ?? aiCondition;
    if (!snapshot.model.trim()) {
      if (!opts?.silent) setError('Add a model before generating a description.');
      return;
    }
    if (opts?.silent && descriptionTouchedRef.current && !opts?.force) return;

    if (!opts?.silent) {
      descriptionEditedDuringAgentRef.current = false;
      setAgentLoading(true);
      setAgentReply(null);
      setError(null);
    }
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
                brand: snapshot.brand,
                model: snapshot.model,
                colorway: snapshot.colorway,
                modelYear: snapshot.model_year ? Number(snapshot.model_year) : null,
                size: Number(snapshot.size) || 10,
                wearState: snapshot.wear_state,
                condition: conditionForWearState(snapshot.wear_state, snapshot.condition),
                listingType: snapshot.listing_type,
                rarity: snapshot.rarity || null,
                weightClass: snapshot.weight_class.trim() || null,
                collectorNotes:
                  snapshot.collector_notes.trim() ||
                  opts?.collectorNotes?.trim() ||
                  catalogCollectorNotes?.trim() ||
                  null,
                upperMaterial: catalogUpperMaterial,
                soleDescription: catalogSoleDescription,
                sellerNote,
                conditionAnalysis: conditionForPrompt
                  ? {
                      summary: conditionForPrompt.summary,
                      listing_tip: conditionForPrompt.listing_tip,
                      breakdown: conditionForPrompt.breakdown,
                    }
                  : null,
              }),
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Description failed');
      if (descriptionEditedDuringAgentRef.current) return;
      if (data.has_draft && (data.draft?.description || data.draft?.colorway)) {
        const clean = data.draft?.description
          ? sanitizeBuyerListingDescription(data.draft.description)
          : '';
        const draftColorway = data.draft?.colorway?.trim() || '';
        setForm((f) => ({
          ...f,
          ...(clean ? { description: clean } : {}),
          ...(draftColorway && (!f.colorway.trim() || opts?.force)
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
        }
        setAgentInput('');
      } else if (data.message) {
        setAgentReply(data.message);
      } else if (!opts?.silent) {
        setError('Could not generate description — try again.');
      }
    } catch (err) {
      if (!opts?.silent) {
        setError(err instanceof Error ? err.message : 'Description failed');
      }
    } finally {
      if (!opts?.silent) setAgentLoading(false);
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
      photosDirtyRef.current = false;
      setImages(refreshed);
      conditionAutoKey.current = null;
      setAiCondition(null);

      if (!refreshed.length && uploadErrors.length) {
        throw new Error(uploadErrors[0] || 'Upload failed');
      }
      if (uploadErrors.length) {
        setUploadError(
          `${uploadErrors.length} photo(s) failed — ${uploadErrors[0]}. Others were saved.`
        );
      }

      if (form.wear_state === 'used' && refreshed.length > 0 && form.model.trim()) {
        void runUsedConditionAnalysis();
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
    photosDirtyRef.current = true;
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

  const onImagesChange = (imgs: ListingImage[]) => {
    photosDirtyRef.current = true;
    setImages(imgs);
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
    let expectedPhotoCount = images.length;
    if (status === 'active' && expectedPhotoCount === 0) {
      setError('Add at least one photo before saving.');
      return;
    }
    setSaving(true);
    try {
      if (photosDirtyRef.current) {
        const savedImages = await normalizeListingImagesForClient(listingId);
        photosDirtyRef.current = false;
        setImages(savedImages);
        expectedPhotoCount = savedImages.length;
        if (status === 'active' && savedImages.length === 0) {
          setError('Add at least one photo before saving.');
          return;
        }
        if (images.length > 0 && savedImages.length < images.length) {
          setError(
            `Only ${savedImages.length} of ${images.length} photos saved. Re-add missing photos before saving.`
          );
          return;
        }
      }

      const description = resolveListingDescriptionForSave(
        form.description,
        descriptionTouchedRef.current,
        descriptionInput()
      );
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
        void fetch('/api/market/ai/rarity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId, persist: true }),
        });
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
      accepts_offers:
        listingType === 'collection' || listingType === 'sell'
          ? f.listing_type === listingType
            ? f.accepts_offers
            : true
          : false,
      price_cents: listingType === 'sell' ? f.price_cents : '',
      shipping_cents: listingType === 'collection' ? '0' : f.shipping_cents,
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
        <BackLink fallbackHref="/market/my-listings" label="My Market" />
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
                : patch.listing_type === 'collection'
                  ? '0'
                  : f.shipping_cents,
            open_to_trade: patch.listing_type === 'sell' ? f.open_to_trade : false,
            accepts_offers:
              patch.listing_type === 'collection' || patch.listing_type === 'sell'
                ? true
                : false,
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
            placeholder="Marsteller, David Taylor…"
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
              Correct brand/model first — AI will re-check catalog details, condition, price, and description
            </span>
          )}
        </div>
        <ListingRarityField
          rarity={form.rarity}
          isAdmin={isAdmin}
          onChange={(rarity) => setForm((f) => ({ ...f, rarity }))}
        />
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
              <ShoeSizeSelect
                className="mt-1"
                value={form.size}
                onChange={(size) => setForm({ ...form, size })}
              />
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
          capture="environment"
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
            onImagesChange={onImagesChange}
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
              onClick={() => {
                const nextWear = opt.value;
                setForm((f) => ({
                  ...f,
                  wear_state: nextWear,
                  condition:
                    nextWear === 'used' ? (f.condition === 'new' ? 'good' : f.condition) : 'new',
                }));
                if (nextWear === 'used' && images.length > 0 && form.model.trim()) {
                  conditionAutoKey.current = null;
                  setAiCondition(null);
                  void runUsedConditionAnalysis({ wearState: 'used' });
                }
              }}
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
              onChange={(e) => {
                setConditionOverridden(true);
                setForm({ ...form, condition: e.target.value });
              }}
            >
              {USED_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {isUsed && analyzing && images.length > 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-accent animate-pulse" />
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            <span>AI reviewing photos for wear…</span>
          </div>
        ) : null}
        {isUsed && aiCondition && !analyzing ? (
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
            {!conditionOverridden && aiCondition.grade !== form.condition ? (
              <button
                type="button"
                onClick={() => {
                  const grade = conditionGradeFromAnalysis('used', aiCondition.grade);
                  if (grade) setForm((f) => ({ ...f, condition: grade }));
                }}
                className="rounded-full bg-accent text-accent-foreground text-sm font-medium px-4 py-1.5 hover:bg-accent/90"
              >
                Apply grade: {gradeDisplay(aiCondition.grade)} ✓
              </button>
            ) : null}
          </div>
        ) : null}
        {catalogEnriching && !analyzing ? (
          <p className="text-xs text-muted-foreground">Looking up catalog details…</p>
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

      {isCollection ? (
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
      ) : null}

      {isPricedListing ? (
        <div className="space-y-3">
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
            if (agentLoading) descriptionEditedDuringAgentRef.current = true;
            setDescriptionTouched(true);
            descriptionTouchedRef.current = true;
            setForm((f) => ({ ...f, description: e.target.value }));
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

      <div>
        <Label>Collector notes (optional)</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-1">
          Release history, PE story, or catalog context — shown to buyers below the description.
        </p>
        <textarea
          className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
          value={form.collector_notes}
          onChange={(e) => setForm((f) => ({ ...f, collector_notes: e.target.value }))}
          placeholder="e.g. David Taylor PE — limited run for Penn State wrestlers…"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        className="w-full min-h-[48px] bg-accent text-accent-foreground font-semibold"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? 'Saving…' : status === 'draft' ? 'Save & publish' : 'Save changes'}
      </Button>

      <Button
        variant="ghost"
        className="w-full min-h-[44px] text-destructive hover:text-destructive"
        disabled={saving}
        onClick={() => {
          if (!window.confirm('Delete this pair? The listing and its photos are removed. This cannot be undone.')) {
            return;
          }
          void (async () => {
            try {
              const res = await fetch(`/api/market/listings/${listingId}`, { method: 'DELETE' });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || data.error) throw new Error(data.error || 'Could not delete this listing');
              router.replace('/market/my-listings');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not delete this listing');
            }
          })();
        }}
      >
        Delete pair
      </Button>

      <p className="text-xs text-muted-foreground">{SELLER_AI_DISCLAIMER}</p>
    </div>
  );
}
