'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackLink } from '@/components/back-link';
import { SELLER_AI_DISCLAIMER } from '@/lib/market/ai/prompts';
import { buildListingDescription } from '@/lib/market/listing-description';
import {
  WEAR_STATE_OPTIONS,
  USED_CONDITIONS,
  conditionForWearState,
  type MarketWearState,
} from '@/lib/market/wear-state';
import { cn } from '@/lib/utils';

const BRANDS = ['Adidas', 'Asics', 'Nike', 'New Balance', 'Other'];
const MAX_PHOTOS = 6;
const BREAKDOWN_KEYS = ['sole', 'upper', 'midsole', 'laces'] as const;

type ListingImage = { id: string; public_url: string; display_order: number };

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
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const [form, setForm] = useState({
    title: '',
    brand: 'Adidas',
    model: '',
    model_year: '',
    size: '10',
    wear_state: 'used' as MarketWearState,
    condition: 'good',
    listing_type: 'sell',
    price_cents: '',
    shipping_cents: '10',
    description: '',
  });

  const isUsed = form.wear_state === 'used';
  const imageKey = images.map((i) => i.id).join(',');

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
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(null);
    setUploading(true);
    try {
      const id = await ensureDraft();
      let order = images.length;
      const uploaded: ListingImage[] = [];

      for (let i = 0; i < files.length; i++) {
        if (order >= MAX_PHOTOS) {
          setError(`Maximum ${MAX_PHOTOS} photos per listing.`);
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

      if (uploaded.length) {
        setImages((prev) =>
          [...prev, ...uploaded].sort((a, b) => a.display_order - b.display_order)
        );
        setAiCondition(null);
        setAiPrice(null);
        setConditionOverridden(false);
        lastAutoKey.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      e.target.value = '';
    }
  };

  const draftPayload = () => ({
    title: form.title || `${form.brand} ${form.model}`.trim(),
    brand: form.brand,
    model: form.model,
    model_year: form.model_year ? Number(form.model_year) : null,
    size: Number(form.size),
    wear_state: form.wear_state,
    condition: conditionForWearState(form.wear_state, form.condition),
    listing_type: form.listing_type,
    description: form.description,
  });

  const descriptionInput = () => ({
    brand: form.brand,
    model: form.model,
    modelYear: form.model_year ? Number(form.model_year) : null,
    size: Number(form.size) || 10,
    wearState: form.wear_state,
    condition: conditionForWearState(form.wear_state, form.condition),
    analysis: null,
  });

  const syncDraft = async () => {
    const id = await ensureDraft();
    await fetch(`/api/market/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftPayload()),
    });
    return id;
  };

  const runPrice = useCallback(async () => {
    setPricing(true);
    try {
      const id = await syncDraft();
      const res = await fetch('/api/market/ai/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, ...draftPayload() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Price failed');
      if (data.price) {
        setAiPrice({
          suggested_low_cents: data.price.suggested_low_cents,
          suggested_mid_cents: data.price.suggested_mid_cents,
          suggested_high_cents: data.price.suggested_high_cents,
          confidence_note: data.price.confidence_note,
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
    try {
      const id = await syncDraft();
      const res = await fetch('/api/market/ai/condition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, wear_state: form.wear_state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAiCondition(data.analysis as AiCondition);
      setConditionOverridden(false);
      await runPrice();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
      pipelineRunning.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.wear_state, listingId, runPrice]);

  useEffect(() => {
    if (!imageKey || uploading || analyzing || pipelineRunning.current) return;
    const key = `${imageKey}|${form.wear_state}`;
    if (lastAutoKey.current === key) return;

    const timer = setTimeout(() => {
      lastAutoKey.current = key;
      void runCondition();
    }, 600);

    return () => clearTimeout(timer);
  }, [imageKey, form.wear_state, uploading, analyzing, runCondition]);

  const applyAiGrade = () => {
    if (!isUsed || !aiCondition?.grade) return;
    if (!(USED_CONDITIONS as readonly string[]).includes(aiCondition.grade)) return;

    const newCondition = aiCondition.grade;
    setForm((f) => ({
      ...f,
      condition: newCondition,
    }));
    setConditionOverridden(false);
    void runPrice();
  };

  const overrideCondition = () => {
    setConditionOverridden(true);
    if (!aiPrice && !pricing) void runPrice();
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
    if (!text) return;
    setAgentLoading(true);
    setAgentReply(null);
    setError(null);
    try {
      const id = await ensureDraft();
      const res = await fetch('/api/market/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: id,
          messages: [{ role: 'user', content: text }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Agent failed');

      if (data.has_draft && data.draft?.description) {
        setForm((f) => ({ ...f, description: data.draft.description }));
        setDescriptionTouched(false);
        setAiDescriptionDraft(true);
        setAgentInput('');
      } else if (data.message) {
        setAgentReply(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent failed');
    } finally {
      setAgentLoading(false);
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
      const priceNum = form.listing_type === 'vault' ? null : Math.round(Number(form.price_cents || 0) * 100);
      const shipNum = Math.round(Number(form.shipping_cents || 0) * 100);

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
                  : 'border-zinc-800 hover:border-zinc-600'
              )}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Photos (JPEG, PNG, WebP)</Label>
          <span className="text-xs text-muted-foreground">
            {images.length}/{MAX_PHOTOS}
          </span>
        </div>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={onPhoto}
          disabled={uploading || images.length >= MAX_PHOTOS}
        />
        <p className="text-xs text-muted-foreground">
          {form.wear_state === 'bnib'
            ? 'Include box and shoes. Up to 6 photos.'
            : 'Use a light background or white surface so shoes stay visible. Up to 6 photos.'}
        </p>
        {uploading && uploadProgress ? (
          <p className="text-sm text-muted-foreground">{uploadProgress}</p>
        ) : null}
        {images.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="aspect-square rounded-lg border border-zinc-800 overflow-hidden bg-zinc-900"
              >
                <img src={img.public_url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No photos yet — add at least one before publishing.</p>
        )}

        {images.length > 0 && analyzing ? (
          <AiSpinner label="Analyzing condition…" />
        ) : null}

        {aiCondition && !analyzing ? (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-accent" />
                <span>AI condition read</span>
              </div>
              <span className="text-lg font-bold text-accent">
                {aiCondition.wrestle_score.toFixed(1)} / 10
              </span>
            </div>
            <div className="border-t border-[#2a2a2a]" />
            <div className="grid grid-cols-2 gap-2">
              {BREAKDOWN_KEYS.map((key) => (
                <div
                  key={key}
                  className="rounded-lg bg-[#111] border border-[#222] px-3 py-2 text-center"
                >
                  <p className="text-[10px] text-zinc-500 capitalize">{key}</p>
                  <p className="text-sm font-semibold">
                    {aiCondition.breakdown[key]?.score ?? '—'}
                  </p>
                </div>
              ))}
            </div>
            {aiCondition.listing_tip ? (
              <>
                <div className="border-t border-[#2a2a2a]" />
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
                  className="rounded-full bg-accent text-black text-sm font-medium px-4 py-1.5 hover:bg-accent/90"
                >
                  Apply grade: {gradeDisplay(aiCondition.grade)} ✓
                </button>
                <button
                  type="button"
                  onClick={overrideCondition}
                  className="rounded-full border border-[#444] text-sm px-4 py-1.5 text-muted-foreground hover:border-zinc-500"
                >
                  Override
                </button>
              </div>
            ) : isUsed && conditionOverridden ? (
              <p className="text-xs text-muted-foreground">Pick condition manually below.</p>
            ) : null}
          </div>
        ) : null}

        {pricing ? <AiSpinner label="Checking market prices…" /> : null}

        {aiPrice && !pricing ? (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-accent" />
              <span>Market price range</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg border border-[#333] px-2 py-3">
                <p className="text-[10px] text-zinc-500 mb-1">Quick sale</p>
                <p className="font-semibold">${Math.round(aiPrice.suggested_low_cents / 100)}</p>
              </div>
              <div className="rounded-lg border-2 border-accent px-2 py-3">
                <p className="text-[10px] text-zinc-500 mb-1">Market avg</p>
                <p className="font-semibold text-accent">${midPrice}</p>
              </div>
              <div className="rounded-lg border border-[#333] px-2 py-3">
                <p className="text-[10px] text-zinc-500 mb-1">Patient seller</p>
                <p className="font-semibold">${Math.round(aiPrice.suggested_high_cents / 100)}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Based on eBay data · Guild comps building
            </p>
            <p className="text-[11px] text-muted-foreground">{aiPrice.confidence_note}</p>
            <button
              type="button"
              onClick={applySuggestedPrice}
              className="rounded-full bg-accent text-black text-sm font-medium px-4 py-1.5 hover:bg-accent/90"
            >
              Use ${midPrice} →
            </button>
          </div>
        ) : null}

        {images.length > 0 ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setAgentExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>Let AI write your description</span>
              <span className="text-xs">{agentExpanded ? '▾' : '▸'}</span>
            </button>
            {agentExpanded ? (
              <div className="space-y-2 pl-1">
                <Input
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  placeholder="Describe in one sentence (e.g. worn one season, toe scuff on left shoe)"
                  disabled={agentLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitAgent();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void submitAgent()}
                  disabled={agentLoading || !agentInput.trim()}
                >
                  {agentLoading ? 'Writing…' : 'Generate description'}
                </Button>
                {agentReply ? (
                  <p className="text-sm text-muted-foreground">{agentReply}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4">
        <div>
          <Label>Brand</Label>
          <select
            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          >
            {BRANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Model</Label>
          <Input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="JB Elite III"
          />
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
            <p className="text-xs text-muted-foreground mt-1">Helps price rare or older colorways.</p>
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
        <div>
          <Label>Description</Label>
          <textarea
            className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
            value={form.description}
            onChange={(e) => {
              setDescriptionTouched(true);
              setAiDescriptionDraft(false);
              setForm({ ...form, description: e.target.value });
            }}
            placeholder="Optional — use AI above or write your own."
          />
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

      <Button className="w-full min-h-[48px] bg-accent text-black font-semibold" onClick={publish}>
        Publish listing
      </Button>

      <p className="text-xs text-zinc-500">{SELLER_AI_DISCLAIMER}</p>
    </div>
  );
}
