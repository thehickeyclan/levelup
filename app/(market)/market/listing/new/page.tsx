'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackLink } from '@/components/back-link';
import { AI_DISCLAIMER } from '@/lib/market/ai/prompts';

const BRANDS = ['Adidas', 'Asics', 'Nike', 'New Balance', 'Other'];
const CONDITIONS = ['new', 'like_new', 'good', 'fair'];

export default function NewListingPage() {
  const router = useRouter();
  const [listingId, setListingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiGrade, setAiGrade] = useState<string | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [suggestedMid, setSuggestedMid] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: '',
    brand: 'Adidas',
    model: '',
    size: '10',
    condition: 'good',
    listing_type: 'sell',
    price_cents: '',
    shipping_cents: '10',
    description: '',
  });

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
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const id = await ensureDraft();
      const fd = new FormData();
      fd.append('file', file);
      fd.append('display_order', '0');
      const res = await fetch(`/api/market/listings/${id}/images`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const runCondition = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const id = await ensureDraft();
      const res = await fetch('/api/market/ai/condition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAiGrade(data.analysis?.grade ?? null);
      setAiScore(data.analysis?.score ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const runPrice = async () => {
    setPricing(true);
    setError(null);
    try {
      const id = await ensureDraft();
      const res = await fetch('/api/market/ai/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Price failed');
      setSuggestedMid(data.price?.suggested_mid_cents ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Price failed');
    } finally {
      setPricing(false);
    }
  };

  const applyAiGrade = () => {
    if (aiGrade && CONDITIONS.includes(aiGrade)) {
      setForm((f) => ({ ...f, condition: aiGrade }));
    }
  };

  const applySuggestedPrice = () => {
    if (suggestedMid) setForm((f) => ({ ...f, price_cents: String(Math.round(suggestedMid / 100)) }));
  };

  const publish = async () => {
    setError(null);
    try {
      const id = await ensureDraft();
      const priceNum = form.listing_type === 'vault' ? null : Math.round(Number(form.price_cents || 0) * 100);
      const shipNum = Math.round(Number(form.shipping_cents || 0) * 100);

      await fetch(`/api/market/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title || `${form.brand} ${form.model}`.trim(),
          brand: form.brand,
          model: form.model,
          size: Number(form.size),
          condition: form.condition,
          listing_type: form.listing_type,
          price_cents: priceNum,
          shipping_cents: shipNum,
          description: form.description,
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

      <div className="space-y-2">
        <Label>Photos (JPEG, PNG, WebP)</Label>
        <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} disabled={uploading} />
        {uploading ? <p className="text-sm text-muted-foreground">Uploading…</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={runCondition} disabled={analyzing}>
          {analyzing ? 'Analyzing…' : 'Analyze condition'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={runPrice} disabled={pricing}>
          {pricing ? 'Pricing…' : 'Suggest price'}
        </Button>
      </div>

      {aiScore != null ? (
        <p className="text-sm">
          AI suggests <strong>{aiGrade}</strong> ({aiScore}/10){' '}
          <button type="button" className="text-accent underline" onClick={applyAiGrade}>Apply grade</button>
        </p>
      ) : null}

      {suggestedMid != null ? (
        <p className="text-sm">
          Suggested ~<strong>${(suggestedMid / 100).toFixed(0)}</strong>{' '}
          <button type="button" className="text-accent underline" onClick={applySuggestedPrice}>Use price</button>
        </p>
      ) : null}

      <div className="grid gap-4">
        <div>
          <Label>Brand</Label>
          <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}>
            {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <Label>Model</Label>
          <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Combat Speed 5" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Size (US)</Label>
            <Input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
          </div>
          <div>
            <Label>Condition</Label>
            <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Price ($)</Label>
            <Input value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: e.target.value })} />
          </div>
          <div>
            <Label>Shipping ($)</Label>
            <Input value={form.shipping_cents} onChange={(e) => setForm({ ...form, shipping_cents: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button className="w-full min-h-[48px] bg-accent text-black font-semibold" onClick={publish}>
        Publish listing
      </Button>

      <p className="text-xs text-zinc-500">{AI_DISCLAIMER}</p>
    </div>
  );
}
