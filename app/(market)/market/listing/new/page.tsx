'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackLink } from '@/components/back-link';
import { SELLER_AI_DISCLAIMER } from '@/lib/market/ai/prompts';
import { cosmeticAppearanceLabel, WRESTLE_SCORE_HINT } from '@/lib/market/condition-grade';
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

type ListingImage = { id: string; public_url: string; display_order: number };

type AiCondition = {
  wrestle_score: number;
  cosmetic_score: number;
  grade: string;
  summary: string;
  cosmetic_summary: string;
};

type AiPrice = {
  suggested_low_cents: number;
  suggested_mid_cents: number;
  suggested_high_cents: number;
  confidence_note: string;
};

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
  const [descriptionTouched, setDescriptionTouched] = useState(false);

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

  const setWearState = (wearState: MarketWearState) => {
    setForm((f) => ({
      ...f,
      wear_state: wearState,
      condition: wearState === 'used' ? (f.condition === 'new' ? 'good' : f.condition) : 'new',
    }));
    setAiCondition(null);
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
    analysis: aiCondition
      ? { summary: aiCondition.summary, cosmetic_summary: aiCondition.cosmetic_summary }
      : null,
  });

  const regenerateDescription = (force = false) => {
    const next = buildListingDescription(descriptionInput());
    if (force || !descriptionTouched || !form.description.trim()) {
      setForm((f) => ({ ...f, description: next }));
      setDescriptionTouched(false);
    }
  };

  const syncDraft = async () => {
    const id = await ensureDraft();
    await fetch(`/api/market/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftPayload()),
    });
    return id;
  };

  const runCondition = async () => {
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
      const suggested = (data.suggested_description as string | undefined)?.trim();
      if (suggested && (!descriptionTouched || !form.description.trim())) {
        setForm((f) => ({ ...f, description: suggested }));
        setDescriptionTouched(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const runPrice = async () => {
    if (!form.model.trim()) {
      setError('Enter brand and model before suggesting a price.');
      return;
    }
    setPricing(true);
    setError(null);
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
  };

  const applyAiGrade = () => {
    if (!isUsed || !aiCondition?.grade) return;
    if (!(USED_CONDITIONS as readonly string[]).includes(aiCondition.grade)) return;

    const newCondition = aiCondition.grade;
    const nextDesc = buildListingDescription({
      ...descriptionInput(),
      condition: conditionForWearState(form.wear_state, newCondition),
    });
    setForm((f) => ({
      ...f,
      condition: newCondition,
      description: !descriptionTouched || !f.description.trim() ? nextDesc : f.description,
    }));
  };

  const applySuggestedPrice = () => {
    if (aiPrice) {
      setForm((f) => ({ ...f, price_cents: String(Math.round(aiPrice.suggested_mid_cents / 100)) }));
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
            : 'Select multiple photos at once (up to 6 total).'}
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
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Seller tools (private)</p>
          <p className="text-xs text-muted-foreground mt-1">
            AI condition and price help you list — buyers never see scores or suggestions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={runCondition} disabled={analyzing || images.length === 0}>
            {analyzing ? 'Analyzing…' : form.wear_state === 'used' ? 'Analyze condition' : 'Verify with AI'}
          </Button>
        </div>
        {images.length === 0 ? (
          <p className="text-xs text-muted-foreground">Upload photos before running AI.</p>
        ) : null}

      {aiCondition ? (
        <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
          <p className="text-sm font-medium">Condition assessment</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-zinc-900/80 border border-zinc-800 p-3 space-y-1">
              <p className="text-xs font-medium text-accent uppercase tracking-wide">Wrestle-ready</p>
              <p className="text-lg font-bold">{aiCondition.wrestle_score}/10</p>
              {isUsed ? (
                <>
                  <p className="text-xs text-muted-foreground capitalize">{aiCondition.grade.replace('_', ' ')}</p>
                  <p className="text-xs text-zinc-500">{WRESTLE_SCORE_HINT}</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Declared new</p>
              )}
            </div>
            <div className="rounded-md bg-zinc-900/80 border border-zinc-800 p-3 space-y-1">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Appearance</p>
              <p className="text-lg font-bold">{aiCondition.cosmetic_score}/10</p>
              <p className="text-xs text-muted-foreground">{cosmeticAppearanceLabel(aiCondition.cosmetic_score)}</p>
            </div>
          </div>
          {aiCondition.summary ? (
            <p className="text-sm text-muted-foreground">{aiCondition.summary}</p>
          ) : null}
          {aiCondition.cosmetic_summary ? (
            <p className="text-xs text-zinc-500">Appearance: {aiCondition.cosmetic_summary}</p>
          ) : null}
          {isUsed ? (
            <button type="button" className="text-sm text-accent underline" onClick={applyAiGrade}>
              Apply wrestle-ready grade to listing
            </button>
          ) : null}
        </div>
      ) : null}
      </div>

      <div className="grid gap-4">
        <div>
          <Label>Brand</Label>
          <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}>
            {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <Label>Model</Label>
          <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="JB Elite III" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Model year (optional)</Label>
            <Input
              value={form.model_year}
              onChange={(e) => setForm({ ...form, model_year: e.target.value.replace(/\D/g, '').slice(0, 4) })}
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
                <option key={c} value={c}>{c.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Price ($)</Label>
            <Input value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: e.target.value })} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={runPrice}
              disabled={pricing}
            >
              {pricing ? 'Suggesting…' : 'Suggest price'}
            </Button>
            {aiPrice ? (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/50 p-3 space-y-2 text-sm">
                <p>
                  Suggested range (private):{' '}
                  <strong>
                    ${(aiPrice.suggested_low_cents / 100).toFixed(0)}–${(aiPrice.suggested_high_cents / 100).toFixed(0)}
                  </strong>{' '}
                  (mid ${(aiPrice.suggested_mid_cents / 100).toFixed(0)})
                </p>
                <p className="text-xs text-muted-foreground">{aiPrice.confidence_note}</p>
                <button type="button" className="text-accent underline text-xs" onClick={applySuggestedPrice}>
                  Use mid price
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Uses wear state, brand, model, year, condition, description, and AI scores.
              </p>
            )}
          </div>
          <div>
            <Label>Shipping ($)</Label>
            <Input value={form.shipping_cents} onChange={(e) => setForm({ ...form, shipping_cents: e.target.value })} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label>Description</Label>
            {aiCondition ? (
              <button
                type="button"
                className="text-xs text-accent underline"
                onClick={() => regenerateDescription(true)}
              >
                Regenerate from AI
              </button>
            ) : null}
          </div>
          <textarea
            className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
            value={form.description}
            onChange={(e) => {
              setDescriptionTouched(true);
              setForm({ ...form, description: e.target.value });
            }}
            placeholder="Runs automatically after condition analysis — edit anytime."
          />
          <p className="text-xs text-muted-foreground mt-1">
            This is what buyers see. No scores or AI labels on the published listing.
          </p>
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
