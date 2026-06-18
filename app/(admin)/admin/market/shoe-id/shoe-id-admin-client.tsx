'use client';

import { useCallback, useState } from 'react';
import { Loader2, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ShoeIdResult } from '@/lib/market/shoe-id/schemas';
import { cn } from '@/lib/utils';

const RARITIES = ['common', 'uncommon', 'rare', 'grail'] as const;
const BRANDS = ['Adidas', 'Asics', 'Nike', 'New Balance', 'Onitsuka', 'Other'];
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function parseApiJson<T extends { error?: string }>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 413 || /request entity too large/i.test(text)) {
      throw new Error('Photo too large for server — use images under 4MB each.');
    }
    throw new Error(text.slice(0, 160) || `Request failed (${res.status})`);
  }
}

type CatalogRow = {
  id: string;
  brand: string;
  model: string;
  years_produced: string | null;
  rarity: string | null;
  value_low_cents: number | null;
  value_high_cents: number | null;
  verified: boolean;
  source: string | null;
};

type CatalogFormState = {
  brand: string;
  model: string;
  model_aliases: string;
  years_produced: string;
  visual_identifiers: string;
  sole_description: string;
  upper_material: string;
  logo_placement: string;
  colorways: string;
  rarity: (typeof RARITIES)[number];
  value_low: string;
  value_mid: string;
  value_high: string;
  collector_notes: string;
};

function emptyForm(): CatalogFormState {
  return {
    brand: 'Adidas',
    model: '',
    model_aliases: '',
    years_produced: '',
    visual_identifiers: '',
    sole_description: '',
    upper_material: '',
    logo_placement: '',
    colorways: '',
    rarity: 'common',
    value_low: '',
    value_mid: '',
    value_high: '',
    collector_notes: '',
  };
}

function formFromResult(r: ShoeIdResult): CatalogFormState {
  return {
    brand: r.brand,
    model: r.model,
    model_aliases: r.model_aliases.join(', '),
    years_produced: r.era,
    visual_identifiers: r.visual_matches.join('; '),
    sole_description: '',
    upper_material: '',
    logo_placement: '',
    colorways: r.colorway,
    rarity: r.rarity,
    value_low: String(Math.round(r.value_low_cents / 100)),
    value_mid: String(Math.round(r.value_mid_cents / 100)),
    value_high: String(Math.round(r.value_high_cents / 100)),
    collector_notes: r.collector_notes,
  };
}

function formToPayload(form: CatalogFormState) {
  return {
    brand: form.brand,
    model: form.model.trim(),
    model_aliases: form.model_aliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    years_produced: form.years_produced || undefined,
    visual_identifiers: form.visual_identifiers
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean),
    sole_description: form.sole_description || undefined,
    upper_material: form.upper_material || undefined,
    logo_placement: form.logo_placement || undefined,
    colorways: form.colorways
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    rarity: form.rarity,
    value_low_cents: form.value_low ? Math.round(Number(form.value_low) * 100) : undefined,
    value_mid_cents: form.value_mid ? Math.round(Number(form.value_mid) * 100) : undefined,
    value_high_cents: form.value_high ? Math.round(Number(form.value_high) * 100) : undefined,
    collector_notes: form.collector_notes || undefined,
    verified: true,
    verified_by: 'Matt Hickey',
  };
}

function ResultCard({
  result,
  catalogMatchId,
}: {
  result: ShoeIdResult;
  catalogMatchId: string | null;
}) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-4 space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-[#C9A265]">
        <Sparkles className="h-4 w-4" />
        Identified
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-[#666]">Brand</dt>
        <dd className="text-white">{result.brand}</dd>
        <dt className="text-[#666]">Model</dt>
        <dd className="text-white">{result.model}</dd>
        <dt className="text-[#666]">Era</dt>
        <dd className="text-white">{result.era}</dd>
        <dt className="text-[#666]">Colorway</dt>
        <dd className="text-white">{result.colorway}</dd>
        <dt className="text-[#666]">Rarity</dt>
        <dd className="text-white capitalize">{result.rarity}</dd>
        <dt className="text-[#666]">Value</dt>
        <dd className="text-[#C9A265]">
          ${Math.round(result.value_low_cents / 100)} – ${Math.round(result.value_high_cents / 100)}
        </dd>
        <dt className="text-[#666]">Confidence</dt>
        <dd className="text-white">{Math.round(result.confidence * 100)}%</dd>
        <dt className="text-[#666]">Matched catalog</dt>
        <dd className="text-white">{catalogMatchId || result.catalog_matched ? 'Yes' : 'No'}</dd>
      </dl>
      {result.visual_matches.length ? (
        <div>
          <p className="text-xs text-[#666] mb-1">Visual matches</p>
          <ul className="text-xs text-[#aaa] space-y-0.5 list-disc pl-4">
            {result.visual_matches.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-[#555]">{result.confidence_note}</p>
    </div>
  );
}

function CatalogForm({
  form,
  setForm,
  onSave,
  saving,
  saveLabel,
}: {
  form: CatalogFormState;
  setForm: (f: CatalogFormState) => void;
  onSave: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-[#333] p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Brand</Label>
          <select
            className="w-full mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
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
          <Label className="text-xs">Model</Label>
          <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Aliases (comma-separated)</Label>
        <Input
          value={form.model_aliases}
          onChange={(e) => setForm({ ...form, model_aliases: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Years produced</Label>
        <Input
          value={form.years_produced}
          onChange={(e) => setForm({ ...form, years_produced: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Visual identifiers (semicolon-separated)</Label>
        <Input
          value={form.visual_identifiers}
          onChange={(e) => setForm({ ...form, visual_identifiers: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Sole</Label>
          <Input
            value={form.sole_description}
            onChange={(e) => setForm({ ...form, sole_description: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Upper material</Label>
          <Input
            value={form.upper_material}
            onChange={(e) => setForm({ ...form, upper_material: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Logo placement</Label>
        <Input
          value={form.logo_placement}
          onChange={(e) => setForm({ ...form, logo_placement: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Colorways (comma-separated)</Label>
        <Input value={form.colorways} onChange={(e) => setForm({ ...form, colorways: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">Rarity</Label>
        <select
          className="w-full mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={form.rarity}
          onChange={(e) =>
            setForm({ ...form, rarity: e.target.value as (typeof RARITIES)[number] })
          }
        >
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Value low ($)</Label>
          <Input value={form.value_low} onChange={(e) => setForm({ ...form, value_low: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Value mid ($)</Label>
          <Input value={form.value_mid} onChange={(e) => setForm({ ...form, value_mid: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Value high ($)</Label>
          <Input value={form.value_high} onChange={(e) => setForm({ ...form, value_high: e.target.value })} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Collector notes</Label>
        <textarea
          className="w-full mt-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm min-h-[60px]"
          value={form.collector_notes}
          onChange={(e) => setForm({ ...form, collector_notes: e.target.value })}
        />
      </div>
      <Button onClick={onSave} disabled={saving || !form.model.trim()} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saveLabel}
      </Button>
    </div>
  );
}

export function ShoeIdAdminClient({ initialCatalog }: { initialCatalog: CatalogRow[] }) {
  const [tab, setTab] = useState<'train' | 'catalog' | 'stats'>('train');
  const [catalog, setCatalog] = useState(initialCatalog);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [result, setResult] = useState<ShoeIdResult | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [catalogMatchId, setCatalogMatchId] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<'correct' | 'wrong' | null>(null);
  const [form, setForm] = useState<CatalogFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{
    totalCatalog: number;
    verifiedCatalog: number;
    totalIdentifications: number;
    correctFirstTryPct: number;
    catalogMatchRate: number;
    mostMissed: { label: string; count: number }[];
    confidenceBuckets: { label: string; count: number }[];
  } | null>(null);

  const loadStats = useCallback(async () => {
    const res = await fetch('/api/admin/market/shoe-id/stats');
    const data = await res.json();
    if (res.ok) {
      setStats(data);
      setCatalog(data.catalog ?? catalog);
    }
  }, [catalog]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const slotsLeft = Math.max(0, 6 - imageUrls.length);
    const toUpload = files.slice(0, slotsLeft);
    if (!toUpload.length) {
      alert('Maximum 6 photos per identification.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress(null);
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i];
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error(
            `${file.name} is over 4MB — resize or export a smaller JPEG before uploading.`
          );
        }
        setUploadProgress(`Uploading ${i + 1} of ${toUpload.length}…`);
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/admin/market/shoe-id/upload', { method: 'POST', body: fd });
        const data = await parseApiJson<{ urls?: string[]; error?: string }>(res);
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        const url = data.urls?.[0];
        if (url) uploaded.push(url);
      }
      setImageUrls((prev) => [...prev, ...uploaded].slice(0, 6));
      setResult(null);
      setConfirmMode(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      e.target.value = '';
    }
  };

  const identify = async () => {
    if (!imageUrls.length) return;
    setIdentifying(true);
    setResult(null);
    setConfirmMode(null);
    try {
      const res = await fetch('/api/market/shoe-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: imageUrls }),
      });
      const data = await parseApiJson<{
        result: ShoeIdResult;
        resultId: string;
        catalogMatchId: string | null;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || 'Identify failed');
      setResult(data.result);
      setResultId(data.resultId);
      setCatalogMatchId(data.catalogMatchId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Identify failed');
    } finally {
      setIdentifying(false);
    }
  };

  const saveConfirm = async (wasCorrect: boolean) => {
    if (!resultId || !form.model.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/market/shoe-id/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultId,
          wasCorrect,
          catalog: formToPayload(form),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setConfirmMode(null);
      setResult(null);
      setImageUrls([]);
      const catRes = await fetch('/api/admin/market/shoe-id/catalog');
      const catData = await catRes.json();
      if (catRes.ok) setCatalog(catData.entries ?? []);
      alert('Catalog entry saved.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this catalog entry?')) return;
    const res = await fetch(`/api/admin/market/shoe-id/catalog/${id}`, { method: 'DELETE' });
    if (res.ok) setCatalog((prev) => prev.filter((e) => e.id !== id));
  };

  const importJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch('/api/admin/market/shoe-id/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      const catRes = await fetch('/api/admin/market/shoe-id/catalog');
      const catData = await catRes.json();
      if (catRes.ok) setCatalog(catData.entries ?? []);
      alert(`Imported ${data.imported} entries.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed');
    }
    e.target.value = '';
  };

  const exportCatalog = () => {
    void (async () => {
      const res = await fetch('/api/admin/market/shoe-id/catalog');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.entries ?? [], null, 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'wrestling-shoes-catalog.json';
      a.click();
    })();
  };

  const tabs = [
    { id: 'train' as const, label: 'Identify & train' },
    { id: 'catalog' as const, label: 'Catalog manager' },
    { id: 'stats' as const, label: 'Training stats' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              if (t.id === 'stats') void loadStats();
            }}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium',
              tab === t.id ? 'bg-[#C9A265] text-black' : 'border border-[#333] text-[#888]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'train' ? (
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-[#888]">
            Upload up to 6 photos of the same pair from different angles — top, outsole, both
            sides, heel, and toe — then run identification.
          </p>
          <label className="flex flex-col items-center gap-2 border border-dashed border-[#333] rounded-xl py-8 cursor-pointer hover:border-[#C9A265]">
            <Upload className="h-5 w-5 text-[#666]" />
            <span className="text-sm text-[#666]">
              {uploadProgress || (uploading ? 'Uploading…' : `Add photos (${imageUrls.length}/6)`)}
            </span>
            <span className="text-[10px] text-[#555]">Max 4MB per photo — upload one angle at a time</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={onUpload}
              disabled={uploading}
            />
          </label>
          {imageUrls.length ? (
            <div className="grid grid-cols-3 gap-2">
              {imageUrls.map((url) => (
                <img key={url} src={url} alt="" className="aspect-square rounded-lg object-cover" />
              ))}
            </div>
          ) : null}
          <Button
            onClick={() => void identify()}
            disabled={!imageUrls.length || identifying}
            className="w-full bg-[#C9A265] text-black"
          >
            {identifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Identifying…
              </>
            ) : (
              'Identify'
            )}
          </Button>
          {result ? (
            <>
              <ResultCard result={result} catalogMatchId={catalogMatchId} />
              {!confirmMode ? (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setForm(formFromResult(result));
                      setConfirmMode('correct');
                    }}
                  >
                    ✓ Correct — add to catalog
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setForm(emptyForm());
                      setConfirmMode('wrong');
                    }}
                  >
                    ✗ Wrong — correct it
                  </Button>
                </div>
              ) : (
                <CatalogForm
                  form={form}
                  setForm={setForm}
                  saving={saving}
                  saveLabel={confirmMode === 'correct' ? 'Save to catalog' : 'Save correction'}
                  onSave={() => void saveConfirm(confirmMode === 'correct')}
                />
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'catalog' ? (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <label className="cursor-pointer">
              <span className="inline-flex items-center rounded-md border border-[#333] px-3 py-1.5 text-sm">
                Import from JSON
              </span>
              <input type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
            </label>
            <button
              type="button"
              className="rounded-md border border-[#333] px-3 py-1.5 text-sm"
              onClick={exportCatalog}
            >
              Export catalog
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#222]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#222] text-left text-[#666]">
                  <th className="p-2">Brand</th>
                  <th className="p-2">Model</th>
                  <th className="p-2">Years</th>
                  <th className="p-2">Rarity</th>
                  <th className="p-2">Value</th>
                  <th className="p-2">Verified</th>
                  <th className="p-2">Source</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {catalog.map((row) => (
                  <tr key={row.id} className="border-b border-[#1a1a1a]">
                    <td className="p-2">{row.brand}</td>
                    <td className="p-2">{row.model}</td>
                    <td className="p-2 text-[#888]">{row.years_produced ?? '—'}</td>
                    <td className="p-2 capitalize">{row.rarity ?? '—'}</td>
                    <td className="p-2 text-[#888]">
                      {row.value_low_cents != null
                        ? `$${row.value_low_cents / 100}–$${(row.value_high_cents ?? 0) / 100}`
                        : '—'}
                    </td>
                    <td className="p-2">{row.verified ? '✓' : '—'}</td>
                    <td className="p-2 text-[#888]">{row.source ?? '—'}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-xs text-red-400"
                        onClick={() => void deleteEntry(row.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {catalog.length === 0 ? (
              <p className="p-4 text-sm text-[#666] text-center">No catalog entries yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'stats' ? (
        <div className="space-y-4 max-w-md">
          {stats ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-[#222] p-3">
                  <p className="text-[#666]">Catalog entries</p>
                  <p className="text-xl font-semibold">{stats.totalCatalog}</p>
                </div>
                <div className="rounded-lg border border-[#222] p-3">
                  <p className="text-[#666]">Verified</p>
                  <p className="text-xl font-semibold">{stats.verifiedCatalog}</p>
                </div>
                <div className="rounded-lg border border-[#222] p-3">
                  <p className="text-[#666]">Identifications</p>
                  <p className="text-xl font-semibold">{stats.totalIdentifications}</p>
                </div>
                <div className="rounded-lg border border-[#222] p-3">
                  <p className="text-[#666]">Catalog match rate</p>
                  <p className="text-xl font-semibold">{stats.catalogMatchRate}%</p>
                </div>
              </div>
              <p className="text-sm text-[#888]">
                Correct on first try: {stats.correctFirstTryPct}% of runs
              </p>
              {stats.mostMissed.length ? (
                <div>
                  <p className="text-xs text-[#666] mb-2">Most missed IDs</p>
                  <ul className="text-sm space-y-1">
                    {stats.mostMissed.map((m) => (
                      <li key={m.label} className="flex justify-between">
                        <span>{m.label}</span>
                        <span className="text-[#888]">{m.count}×</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <p className="text-xs text-[#666] mb-2">Confidence distribution</p>
                {stats.confidenceBuckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-2 mb-1 text-sm">
                    <span className="w-20 text-[#888]">{b.label}</span>
                    <div className="flex-1 h-2 bg-[#222] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#C9A265]"
                        style={{
                          width: `${stats.totalIdentifications ? (b.count / stats.totalIdentifications) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right">{b.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#666]">Loading stats…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
