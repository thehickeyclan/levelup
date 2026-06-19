'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { PhotoCleanToggle, photoThumbnailSrc } from '@/components/market/photo-clean-toggle';
import { ShoeIdCard, type ShoeIdAcceptPayload } from '@/components/market/shoe-id-card';
import {
  BROWSE_COLOR_FAMILIES,
  inferColorFamilyFromColorway,
  parseColorFamily,
} from '@/lib/market/color-family';
import { SimilarSalesGuidance, priceGuidanceFooter } from '@/components/market/similar-sales-guidance';
import { shoeIdClientEnabled } from '@/lib/market/shoe-id/feature-flag';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';
import { MARKET_BRANDS, normalizeMarketBrand } from '@/lib/market/brands';
import type { MarketRarity } from '@/lib/market/rarity';
import type { PriceComp } from '@/lib/market/ai/schemas';
import type { MarketListingImageRow } from '@/lib/market/listing-images';
import { prepareListingPhotos } from '@/lib/market/prepare-listing-photo';
import { cn } from '@/lib/utils';

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
  const [listingId, setListingId] = useState<string | null>(null);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [identifyingShoe, setIdentifyingShoe] = useState(false);
  const [shoeIdResult, setShoeIdResult] = useState<ShoeIdResult | null>(null);
  const [shoeIdAutoApplied, setShoeIdAutoApplied] = useState(false);
  const [shoeIdUserOverride, setShoeIdUserOverride] = useState(false);
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

  const lastAutoKey = useRef<string | null>(null);
  const pipelineRunning = useRef(false);
  /** User manually set brand/model — AI must not overwrite those fields. */
  const shoeIdUserLocked = useRef(false);
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
    listing_type: 'sell' as MarketListingType,
    open_to_trade: false,
    price_cents: '',
    shipping_cents: '10',
    description: '',
    rarity: '' as MarketRarity | '',
  });

  const sellerPrefillDone = useRef(false);

  useEffect(() => {
    if (sellerPrefillDone.current) return;
    sellerPrefillDone.current = true;
    void (async () => {
      try {
        const res = await fetch('/api/market/seller-shoe-hints');
        const data = await res.json();
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
  const isPricedListing = form.listing_type === 'sell';
  const isCollection = form.listing_type === 'collection';
  const updateImage = (imageId: string, patch: Partial<MarketListingImageRow>) => {
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, ...patch } : img))
    );
  };

  const imageKey = images.map((i) => i.id).join(',');

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

  const lockShoeIdentity = useCallback(() => {
    shoeIdUserLocked.current = true;
    setShoeIdUserOverride(true);
    setShoeIdAutoApplied(false);
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
  };

  const setWearState = (wearState: MarketWearState) => {
    setForm((f) => ({
      ...f,
      wear_state: wearState,
      condition: wearState === 'used' ? (f.condition === 'new' ? 'good' : f.condition) : 'new',
    }));
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
      body: JSON.stringify({ draft: true }),
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
    analysis: aiCondition
      ? {
          listing_tip: aiCondition.listing_tip,
        }
      : null,
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

  const runCondition = useCallback(async () => {
    if (pipelineRunning.current) return;
    pipelineRunning.current = true;
    setAnalyzing(true);
    setError(null);
    let overrides: Partial<typeof form> = {};
    try {
      const id = await ensureDraft();

      if (shoeIdClientEnabled() && images.length > 0) {
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
            const locked = shoeIdUserLocked.current;
            const dominant = data.sellerDominantListing as
              | { brand: string; model: string; model_year: number | null }
              | null
              | undefined;
            const useSellerIdentity =
              !locked &&
              data.autoApplyRecommended === false &&
              dominant?.brand &&
              dominant?.model;
            const shoePayload = locked
              ? {
                  brand: form.brand,
                  model: form.model,
                  colorway: data.result.colorway,
                }
              : useSellerIdentity
                ? {
                    brand: dominant.brand,
                    model: dominant.model,
                    colorway: data.result.colorway,
                  }
                : {
                    brand: data.result.brand,
                    model: data.result.model,
                    colorway: data.result.colorway,
                  };
            const shoeOverrides = applyShoeIdPayload(shoePayload, {
              colorwayOnly: locked,
            });
            if (!locked && useSellerIdentity && dominant.model_year) {
              shoeOverrides.model_year = String(dominant.model_year);
            }
            setShoeIdResult(data.result as ShoeIdResult);
            if (data.result.rarity) {
              overrides = { ...overrides, rarity: data.result.rarity };
              setForm((f) => ({ ...f, rarity: data.result.rarity }));
            }
            if (locked) {
              overrides = { ...overrides, ...shoeOverrides };
              setForm((f) => ({ ...f, ...shoeOverrides }));
              setUploadError(null);
            } else if (data.autoApplyRecommended !== false || useSellerIdentity) {
              overrides = { ...overrides, ...shoeOverrides };
              setShoeIdAutoApplied(true);
              setForm((f) => ({ ...f, ...shoeOverrides }));
              if (useSellerIdentity) {
                setUploadError(
                  `Kept ${dominant.brand} ${dominant.model} from your past listings — only colorway came from AI.`
                );
              } else {
                setUploadError(null);
              }
            } else {
              setUploadError(
                `AI guessed ${data.result.brand} but your listings are usually ${data.sellerDominantBrand ?? 'a different brand'} — pick brand from the dropdown.`
              );
            }
          }
        } catch {
          // Non-fatal — condition analysis can still run
        } finally {
          setIdentifyingShoe(false);
        }
      }

      await fetch(`/api/market/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload(overrides)),
      });

      const res = await fetch('/api/market/ai/condition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, wear_state: form.wear_state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAiCondition(data.analysis as AiCondition);
      setConditionOverridden(false);
      if (form.listing_type !== 'collection') {
        await runPrice(overrides);
      }
      const modelAfterId = overrides.model?.trim() || form.model.trim();
      if (!descriptionTouched && !form.description.trim() && modelAfterId) {
        void generateDescription({ silent: true, overrides });
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
    applyShoeIdPayload,
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
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market" label="Back to Market" />

      <h1 className="text-2xl font-bold">List a pair</h1>

      <div className="space-y-3">
        <Label>What are you selling?</Label>
        <div className="space-y-2">
          {WEAR_STATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setWearState(opt.value)}
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
      </div>

      <div className="grid gap-4">
        <div>
          <Label>Brand</Label>
          <select
            className={cn(
              'w-full mt-1 rounded-md border bg-background px-3 py-2',
              shoeIdUserOverride ? 'border-amber-500/50' : 'border-input'
            )}
            value={form.brand}
            onChange={(e) => {
              lockShoeIdentity();
              setForm({ ...form, brand: e.target.value });
            }}
          >
            {MARKET_BRANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          {shoeIdUserOverride ? (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              Your brand wins over AI — change model if needed.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Set before photos if you already know the shoe — AI won&apos;t overwrite your brand or model.
            </p>
          )}
        </div>
        <div>
          <Label>Model</Label>
          <Input
            value={form.model}
            onChange={(e) => {
              lockShoeIdentity();
              setForm({ ...form, model: e.target.value });
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

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Photos (JPEG, PNG, WebP)</Label>
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
          className={cn(
            'w-full rounded-xl border border-dashed py-8 flex flex-col items-center justify-center gap-2 transition-colors touch-manipulation',
            error && images.length === 0
              ? 'border-destructive/50 text-destructive'
              : uploadError
                ? 'border-destructive/50 text-destructive'
                : 'border-border text-muted-foreground hover:border-accent hover:text-accent'
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">{uploadProgress ?? 'Uploading…'}</span>
            </>
          ) : (
            <>
              <Plus className="h-5 w-5" />
              <span className="text-sm">
                {images.length
                  ? `Add more photos (${images.length}/${MAX_PHOTOS})`
                  : 'Tap to add photos'}
              </span>
            </>
          )}
        </button>
        {uploadError ? (
          <p className="text-sm text-destructive">{uploadError}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {form.wear_state === 'bnib'
            ? 'Include box and shoes. Up to 6 photos.'
            : 'Use a light background or white surface so shoes stay visible. Up to 6 photos.'}
        </p>
        {images.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img) => (
              <div key={img.id}>
                <div className="aspect-square rounded-lg border border-border overflow-hidden bg-card">
                  <img src={photoThumbnailSrc(img)} alt="" className="w-full h-full object-cover" />
                </div>
                {listingId ? (
                  <PhotoCleanToggle
                    listingId={listingId}
                    image={img}
                    onUpdate={updateImage}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No photos yet — add at least one before publishing.</p>
        )}

        {shoeIdClientEnabled() && listingId && images.length > 0 ? (
          <ShoeIdCard
            listingId={listingId}
            images={images}
            externalResult={shoeIdResult}
            externalLoading={identifyingShoe}
            autoApplied={shoeIdAutoApplied}
            userLocked={shoeIdUserOverride}
            formBrand={form.brand}
            formModel={form.model}
            onAccept={(payload, opts) => {
              const shoeOverrides = applyShoeIdPayload(payload, opts);
              setForm((f) => ({ ...f, ...shoeOverrides }));
              if (!opts?.colorwayOnly) {
                setShoeIdAutoApplied(true);
              }
              if (form.listing_type !== 'collection') {
                void runPrice(shoeOverrides);
              }
              if (!descriptionTouched && !form.description.trim()) {
                void generateDescription({ silent: true, overrides: shoeOverrides });
              }
            }}
          />
        ) : null}

        {images.length > 0 && identifyingShoe ? (
          <AiSpinner label="Identifying shoe from photos…" />
        ) : null}

        {images.length > 0 && analyzing && !identifyingShoe ? (
          <AiSpinner label="Analyzing condition…" />
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
            {isUsed && !conditionOverridden ? (
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
      </div>

      <div className="grid gap-4">
        <div>
          <Label>Colorway (optional)</Label>
          <Input
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
            placeholder="Cherry, Black/Gold, Dick's exclusive"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Helps match rare or discontinued colorways for pricing and your collection.
          </p>
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
          <p className="text-xs text-muted-foreground mt-1">
            What buyers filter on — blue, red, black. Auto-guesses from colorway when you leave this on Auto.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Model year (optional)</Label>
            <Input
              value={form.model_year}
              onChange={(e) =>
                setForm({ ...form, model_year: e.target.value.replace(/\D/g, '').slice(0, 4) })
              }
              placeholder="2016"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label>Size (US)</Label>
            <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
          </div>
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
        <div className="space-y-3">
          <Label>How do you want to list it?</Label>
          <div className="space-y-2">
            {SELLER_LISTING_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setListingType(opt.value)}
                className={cn(
                  'w-full text-left rounded-lg border px-3 py-3 transition-colors',
                  form.listing_type === opt.value
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/40'
                )}
              >
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
              </button>
            ))}
          </div>
          {form.listing_type === 'sell' ? (
            <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.open_to_trade}
                onChange={(e) => setForm((f) => ({ ...f, open_to_trade: e.target.checked }))}
              />
              <span>
                <span className="text-sm font-medium text-foreground block">Also open to trades</span>
                <span className="text-xs text-muted-foreground">
                  Buyers can offer their shoes instead of paying cash
                </span>
              </span>
            </label>
          ) : null}
          {isCollection ? (
            <div className="rounded-lg border border-border bg-card/80 px-3 py-3">
              <p className="text-sm text-foreground/80">
                This pair appears on your profile under Collection. Buyers can see it but can&apos;t make offers.
                Move it to Offers anytime from My pairs.
              </p>
            </div>
          ) : null}
          {form.listing_type === 'vault' ? (
            <div className="rounded-lg border border-border bg-card/80 px-3 py-3">
              <p className="text-sm text-foreground/80">
                Buyers send you cash or trade offers. You pick the best one.
              </p>
            </div>
          ) : null}
        </div>
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
        ) : form.listing_type === 'trade' ? (
          <div className="rounded-lg border border-border bg-card/60 px-3 py-3">
            <p className="text-sm text-muted-foreground">
              No price — buyers propose a trade with shoes from their listings.
            </p>
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
            className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
            value={form.description}
            onChange={(e) => {
              setDescriptionTouched(true);
              setAiDescriptionDraft(false);
              setForm({ ...form, description: e.target.value });
            }}
            placeholder={
              form.model.trim()
                ? 'AI can draft this from brand, model, colorway, and condition — or write your own.'
                : 'Add model first, then use Generate with AI or write your own.'
            }
          />
          {agentReply ? (
            <p className="text-xs text-muted-foreground mt-1">{agentReply}</p>
          ) : null}
          {agentExpanded ? (
            <div className="mt-2 space-y-2">
              <Input
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                placeholder="Optional detail for AI (e.g. worn one season, small toe scuff)"
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
              + Add a personal note for AI
            </button>
          )}
          {aiDescriptionDraft ? (
            <p className="text-xs text-muted-foreground mt-1">AI draft — tap to edit</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              This is what buyers see. No scores or AI labels on the published listing.
            </p>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button className="w-full min-h-[48px] bg-accent text-accent-foreground font-semibold" onClick={publish}>
        Publish listing
      </Button>

      <p className="text-xs text-muted-foreground">{SELLER_AI_DISCLAIMER}</p>
    </div>
  );
}
