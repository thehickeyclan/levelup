'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BROWSE_US_SIZES } from '@/lib/market/browse-listings';
import { MARKET_BRANDS } from '@/lib/market/brands';
import { listingConditionDisplay, conditionForWearState } from '@/lib/market/wear-state';
import type { OfferListingSummary } from '@/app/(market)/market/listing/[id]/offer/offer-form-client';
import { prepareListingPhotos } from '@/lib/market/prepare-listing-photo';
import { fetchListingImagesForClient } from '@/lib/market/listing-images';
import { cn } from '@/lib/utils';

const CONDITION_OPTIONS = [
  { id: 'new', label: 'New' },
  { id: 'like_new', label: 'Like new' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
] as const;
const MAX_PHOTOS = 6;

type ListingImage = { id: string; public_url: string; display_order: number };

type AiCondition = {
  wrestle_score: number;
  grade: string;
};

function gradeDisplay(grade: string) {
  return grade.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function wearStateForCondition(condition: string): 'new_no_box' | 'used' {
  return condition === 'new' ? 'new_no_box' : 'used';
}

export function QuickTradeListingSheet({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (listing: OfferListingSummary) => void;
}) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiCondition, setAiCondition] = useState<AiCondition | null>(null);
  const [conditionOverridden, setConditionOverridden] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [brand, setBrand] = useState<string>(MARKET_BRANDS[0]);
  const [model, setModel] = useState('');
  const [size, setSize] = useState('10');
  const [condition, setCondition] = useState('');

  const lastAutoKey = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageKey = images.map((i) => i.id).join(',');

  const resetState = useCallback(() => {
    setDraftId(null);
    setImages([]);
    setUploading(false);
    setUploadError(null);
    setCreateError(null);
    setAnalyzing(false);
    setAiCondition(null);
    setConditionOverridden(false);
    setPublishing(false);
    setPublishError(null);
    setBrand(MARKET_BRANDS[0]);
    setModel('');
    setSize('10');
    setCondition('');
    lastAutoKey.current = null;
  }, []);

  const ensureDraft = async (): Promise<string> => {
    if (draftId) return draftId;
    const res = await fetch('/api/market/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: true, listing_type: 'trade' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create draft');
    setDraftId(data.listingId);
    setCreateError(null);
    return data.listingId as string;
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? []);
    if (!rawFiles.length) return;
    setUploadError(null);
    setCreateError(null);
    setUploading(true);
    try {
      const { files, prepareErrors } = await prepareListingPhotos(rawFiles);

      if (!files.length) {
        throw new Error(prepareErrors[0] || 'Could not read these photos — try again or use JPEG/PNG.');
      }

      const id = await ensureDraft();
      let serverCount = (await fetchListingImagesForClient(id)).length;
      const uploadErrors: string[] = [...prepareErrors];

      for (let i = 0; i < files.length; i++) {
        if (serverCount >= MAX_PHOTOS) break;
        const fd = new FormData();
        fd.append('file', files[i]);
        const res = await fetch(`/api/market/listings/${id}/images`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
          uploadErrors.push(data.error || `Photo ${i + 1} failed`);
          continue;
        }
        if (data.image) {
          serverCount += 1;
        }
      }

      const refreshed = await fetchListingImagesForClient(id);
      setImages(
        refreshed.map((img) => ({
          id: img.id!,
          public_url: img.public_url,
          display_order: img.display_order,
        }))
      );

      if (!refreshed.length) {
        throw new Error(uploadErrors[0] || 'No photos uploaded — try again.');
      }
      if (uploadErrors.length) {
        setUploadError(`${uploadErrors.length} photo(s) failed — ${uploadErrors[0]}.`);
      }
      setAiCondition(null);
      setConditionOverridden(false);
      setCondition('');
      lastAutoKey.current = null;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const runCondition = useCallback(async () => {
    if (!draftId || !imageKey) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/market/ai/condition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: draftId, wear_state: 'used' }),
      });
      const data = await res.json();
      if (!res.ok) return;
      if (data.analysis) {
        setAiCondition({
          wrestle_score: data.analysis.wrestle_score,
          grade: data.analysis.grade,
        });
      }
    } catch {
      // Skip AI card silently on failure
    } finally {
      setAnalyzing(false);
    }
  }, [draftId, imageKey]);

  useEffect(() => {
    if (!open || !imageKey || uploading || analyzing) return;
    const key = imageKey;
    if (lastAutoKey.current === key) return;
    const timer = setTimeout(() => {
      lastAutoKey.current = key;
      void runCondition();
    }, 600);
    return () => clearTimeout(timer);
  }, [open, imageKey, uploading, analyzing, runCondition]);

  const applyAiGrade = () => {
    if (!aiCondition?.grade) return;
    const grade = aiCondition.grade;
    if (grade === 'new') {
      setCondition('new');
    } else if (['like_new', 'good', 'fair'].includes(grade)) {
      setCondition(grade);
    }
    setConditionOverridden(false);
  };

  const handleCancel = async () => {
    if (draftId) {
      try {
        await fetch(`/api/market/listings/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'draft' }),
        });
      } catch {
        // Best-effort draft retention for cron cleanup
      }
    }
    resetState();
    onClose();
  };

  const detailsComplete =
    Boolean(brand) && Boolean(model.trim()) && Boolean(size) && Boolean(condition);

  const handleConfirm = async () => {
    if (!draftId || images.length === 0 || !detailsComplete) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const wearState = wearStateForCondition(condition);
      const finalCondition = conditionForWearState(wearState, condition);
      const title = `${brand} ${model}`.trim();

      const res = await fetch(`/api/market/listings/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          brand,
          model: model.trim(),
          size: Number(size),
          condition: finalCondition,
          wear_state: wearState,
          listing_type: 'trade',
          shipping_cents: 0,
          status: 'active',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish listing');

      onComplete({
        id: draftId,
        title,
        brand,
        model: model.trim(),
        size: Number(size),
        conditionLabel: listingConditionDisplay(wearState, finalCondition),
        imageUrl: images[0]?.public_url ?? null,
      });
      resetState();
      onClose();
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPublishing(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-foreground/75"
        onClick={() => void handleCancel()}
        aria-hidden
      />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-muted border-t border-border">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted px-4 py-3">
          <button
            type="button"
            onClick={() => void handleCancel()}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </button>
          <p className="text-sm font-medium text-foreground">Add a pair to trade</p>
          <span className="w-14" />
        </div>

        <div className="space-y-6 px-4 py-5 pb-8">
          {/* Step 1 — Photos */}
          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Upload photos of what you&apos;re offering</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use a light background so your pair is easy to see
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={onPhoto}
              disabled={uploading || images.length >= MAX_PHOTOS}
            />

            <button
              type="button"
              onClick={() => {
                if (createError) {
                  setCreateError(null);
                  void ensureDraft().catch(() => {
                    setCreateError('Something went wrong — try again');
                  });
                }
                fileInputRef.current?.click();
              }}
              disabled={uploading || images.length >= MAX_PHOTOS}
              className={cn(
                'w-full rounded-xl border border-dashed py-8 flex flex-col items-center justify-center gap-2 transition-colors',
                uploadError
                  ? 'border-red-500/50 text-red-400'
                  : 'border-border text-muted-foreground hover:border-accent hover:text-accent'
              )}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Uploading…</span>
                </>
              ) : uploadError ? (
                <span className="text-sm">Upload failed — tap to retry</span>
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  <span className="text-sm">
                    {images.length ? `Add more (${images.length}/${MAX_PHOTOS})` : 'Tap to add photos'}
                  </span>
                </>
              )}
            </button>

            {createError ? (
              <div className="flex items-center justify-between gap-2 text-sm text-red-400">
                <span>{createError}</span>
                <button
                  type="button"
                  className="text-accent underline"
                  onClick={() => {
                    setCreateError(null);
                    void ensureDraft().catch(() => {
                      setCreateError('Something went wrong — try again');
                    });
                  }}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {images.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="aspect-square rounded-lg border border-border overflow-hidden bg-card"
                  >
                    <img src={img.public_url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}

            {analyzing ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-accent animate-pulse" />
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                <span>Scoring condition…</span>
              </div>
            ) : null}

            {aiCondition && !analyzing && !conditionOverridden ? (
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <p className="text-sm text-foreground/80">
                  <Sparkles className="inline h-3.5 w-3.5 text-accent mr-1" />
                  AI condition read:{' '}
                  <span className="text-accent font-medium">
                    {aiCondition.wrestle_score.toFixed(1)} / 10 · {gradeDisplay(aiCondition.grade)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyAiGrade}
                    className="rounded-full bg-accent text-accent-foreground text-xs font-medium px-3 py-1.5"
                  >
                    Apply grade: {gradeDisplay(aiCondition.grade)} ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setConditionOverridden(true)}
                    className="rounded-full border border-border text-xs px-3 py-1.5 text-muted-foreground"
                  >
                    Override
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {/* Step 2 — Details */}
          {images.length > 0 ? (
            <section className="space-y-3 border-t border-border pt-5">
              <p className="text-sm font-medium text-foreground">Details</p>
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Brand</Label>
                  <select
                    className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  >
                    {MARKET_BRANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Model</Label>
                  <Input
                    className="mt-1 bg-card border-border"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. JB Elite IV"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Size</Label>
                  <select
                    className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  >
                    {BROWSE_US_SIZES.map((s) => (
                      <option key={s} value={String(s)}>
                        {Number.isInteger(s) ? s : s.toFixed(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Condition</Label>
                  {(conditionOverridden || !aiCondition) && (
                    <select
                      className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                    >
                      <option value="">Select condition</option>
                      {CONDITION_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {condition && !conditionOverridden && aiCondition ? (
                    <p className="mt-1 text-sm text-accent">
                      {CONDITION_OPTIONS.find((o) => o.id === condition)?.label ?? condition}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {/* Step 3 — Confirm */}
          {detailsComplete ? (
            <section className="space-y-3 border-t border-border pt-5">
              {publishError ? (
                <div className="flex items-center justify-between gap-2 text-sm text-red-400">
                  <span>{publishError}</span>
                  <button
                    type="button"
                    className="text-accent underline shrink-0"
                    onClick={() => void handleConfirm()}
                  >
                    Try again
                  </button>
                </div>
              ) : null}
              <Button
                className="w-full min-h-[48px] bg-accent text-accent-foreground font-semibold rounded-full hover:bg-accent/90"
                onClick={() => void handleConfirm()}
                disabled={publishing}
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Publishing…
                  </>
                ) : (
                  'Use this pair in my trade offer'
                )}
              </Button>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
