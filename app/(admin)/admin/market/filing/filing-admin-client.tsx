'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FilingClassification } from '@/lib/market/filing-check';

type Row = {
  id: string;
  title: string;
  brand: string;
  model: string;
  colorway: string | null;
  listing_type: string;
  price_cents: number | null;
  classification: FilingClassification;
};

type PhotoCheckResult = {
  verdict: 'agrees' | 'disagrees' | 'inconclusive';
  note: string;
  photo: {
    brand: string;
    model: string;
    colorway: string;
    confidence: number;
    inCatalog: boolean;
  };
};

const STATUS_ORDER: Record<FilingClassification['status'], number> = {
  legacy_alias: 0,
  ambiguous_alias: 1,
  unfiled: 2,
  canonical: 3,
};

function statusChip(status: FilingClassification['status']) {
  switch (status) {
    case 'canonical':
      return { label: 'Canonical', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' };
    case 'legacy_alias':
      return { label: 'Legacy name', cls: 'bg-accent/10 text-accent border-accent/30' };
    case 'ambiguous_alias':
      return { label: 'Ambiguous', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30' };
    case 'unfiled':
      return { label: 'Not in catalog', cls: 'bg-red-500/10 text-red-400 border-red-500/30' };
  }
}

export function FilingAdminClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [photoResults, setPhotoResults] = useState<Record<string, PhotoCheckResult>>({});
  const [showCanonical, setShowCanonical] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/market/filing');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setRows(data.rows as Row[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...(rows ?? [])].sort(
        (a, b) =>
          STATUS_ORDER[a.classification.status] - STATUS_ORDER[b.classification.status] ||
          a.model.localeCompare(b.model)
      ),
    [rows]
  );
  const needsWork = sorted.filter((r) => r.classification.status !== 'canonical');
  const canonical = sorted.filter((r) => r.classification.status === 'canonical');

  async function refile(row: Row, brand: string, model: string) {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch('/api/admin/market/filing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refile', listingId: row.id, brand, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refile failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refile failed');
    } finally {
      setBusy(null);
    }
  }

  async function photoCheck(row: Row) {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch('/api/admin/market/filing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'photo-check', listingId: row.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Photo check failed');
      setPhotoResults((prev) => ({ ...prev, [row.id]: data as PhotoCheckResult }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo check failed');
    } finally {
      setBusy(null);
    }
  }

  function renderRow(row: Row) {
    const chip = statusChip(row.classification.status);
    const photo = photoResults[row.id];
    return (
      <div key={row.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <Link
              href={`/market/listing/${row.id}`}
              className="font-medium hover:underline"
              target="_blank"
            >
              {row.brand} {row.model}
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5">
              {[
                row.title && row.title !== `${row.brand} ${row.model}` ? `“${row.title}”` : null,
                row.colorway,
                row.listing_type,
                row.price_cents != null ? `$${Math.round(row.price_cents / 100)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', chip.cls)}>
            {chip.label}
          </span>
        </div>

        {row.classification.status === 'legacy_alias' ? (
          <button
            type="button"
            disabled={busy === row.id}
            onClick={() =>
              void refile(
                row,
                row.classification.status === 'legacy_alias' ? row.classification.refileTo.brand : '',
                row.classification.status === 'legacy_alias' ? row.classification.refileTo.model : ''
              )
            }
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {busy === row.id ? 'Refiling…' : `Refile to ${row.classification.refileTo.brand} ${row.classification.refileTo.model}`}
          </button>
        ) : null}

        {row.classification.status === 'ambiguous_alias' ? (
          <div className="flex gap-2 flex-wrap">
            {row.classification.candidates.map((c) => (
              <button
                key={`${c.brand}|${c.model}`}
                type="button"
                disabled={busy === row.id}
                onClick={() => void refile(row, c.brand, c.model)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground hover:border-accent disabled:opacity-50"
              >
                Refile to {c.brand} {c.model}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            disabled={busy === row.id}
            onClick={() => void photoCheck(row)}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy === row.id ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking photos…
              </span>
            ) : (
              'Photo check'
            )}
          </button>
          {photo ? (
            <span
              className={cn(
                'text-xs',
                photo.verdict === 'agrees'
                  ? 'text-emerald-500'
                  : photo.verdict === 'disagrees'
                    ? 'text-red-400'
                    : 'text-muted-foreground'
              )}
            >
              {photo.note}
            </span>
          ) : null}
        </div>

        {photo && photo.verdict === 'disagrees' && photo.photo.inCatalog ? (
          <button
            type="button"
            disabled={busy === row.id}
            onClick={() => void refile(row, photo.photo.brand, photo.photo.model)}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            Refile to {photo.photo.brand} {photo.photo.model}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Listing filing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Standards §1.6 — the photo decides what a shoe is, not the title. Legacy names
            refile in one click; disagreements get a photo check first.
          </p>
        </div>
        <Link href="/admin/market" className="text-sm text-accent hover:underline shrink-0">
          ← Market admin
        </Link>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {rows == null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading listings…
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {needsWork.length ? (
              needsWork.map(renderRow)
            ) : (
              <p className="text-sm text-muted-foreground">
                Every live listing is filed to a catalog model.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowCanonical((v) => !v)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {showCanonical ? 'Hide' : 'Show'} {canonical.length} correctly filed listing
            {canonical.length !== 1 ? 's' : ''}
          </button>
          {showCanonical ? <div className="space-y-3">{canonical.map(renderRow)}</div> : null}
        </>
      )}
    </div>
  );
}
