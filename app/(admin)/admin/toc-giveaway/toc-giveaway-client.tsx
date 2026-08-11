'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TOC_MARKET_FOLLOW_GOAL } from '@/lib/toc-giveaway';

export type TocGiveawayEntry = {
  id: string;
  campaign: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  zip_code: string | null;
  eligible: boolean;
  winner: boolean;
  credit_granted: boolean;
  credit_id: string | null;
  created_at: string;
  selected_at: string | null;
  credited_at: string | null;
  shoe_follow_count?: number;
  market_qualified?: boolean;
};

function nameFor(entry: TocGiveawayEntry) {
  return [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim() || entry.email;
}

function shortDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function TocGiveawayClient({ initialEntries }: { initialEntries: TocGiveawayEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [actingId, setActingId] = useState<string | null>(null);
  const stats = useMemo(() => {
    const eligible = entries.filter((e) => e.eligible).length;
    const marketQualified = entries.filter((e) => e.market_qualified).length;
    const winners = entries.filter((e) => e.winner).length;
    const credited = entries.filter((e) => e.credit_granted).length;
    return { eligible, marketQualified, winners, credited };
  }, [entries]);

  const updateWinner = async (entry: TocGiveawayEntry, winner: boolean) => {
    setActingId(entry.id);
    try {
      const res = await fetch(`/api/admin/toc-giveaway/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update winner');
      setEntries((rows) =>
        rows.map((row) =>
          row.id === entry.id
            ? { ...row, winner, selected_at: winner ? new Date().toISOString() : null }
            : row
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update winner');
    } finally {
      setActingId(null);
    }
  };

  const grantCredit = async (entry: TocGiveawayEntry) => {
    if (!window.confirm(`Grant $100 Guild training credit to ${nameFor(entry)}?`)) return;
    setActingId(entry.id);
    try {
      const res = await fetch(`/api/admin/toc-giveaway/${entry.id}`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to grant credit');
      setEntries((rows) =>
        rows.map((row) =>
          row.id === entry.id
            ? {
                ...row,
                winner: true,
                credit_granted: true,
                credit_id: json.creditId ?? row.credit_id,
                selected_at: row.selected_at ?? new Date().toISOString(),
                credited_at: new Date().toISOString(),
              }
            : row
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to grant credit');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Eligible entries</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{stats.eligible}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Followed 5 shoes</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{stats.marketQualified}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Selected winners</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{stats.winners}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">$100 credits granted</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{stats.credited}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Wrestler</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">ZIP</th>
              <th className="px-4 py-3">Market follows</th>
              <th className="px-4 py-3">Signed up</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{nameFor(entry)}</p>
                  <p className="text-xs text-muted-foreground">{entry.campaign}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <p>{entry.email}</p>
                  <p>{entry.phone || 'No phone'}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.zip_code || '—'}</td>
                <td className="px-4 py-3">
                  <div className="min-w-28">
                    <p className="font-medium text-foreground">
                      {entry.shoe_follow_count ?? 0}/{TOC_MARKET_FOLLOW_GOAL}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.market_qualified ? 'Raffle qualified' : 'Needs more follows'}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{shortDate(entry.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {entry.market_qualified && (
                      <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300">
                        5 shoes
                      </span>
                    )}
                    {entry.winner && (
                      <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                        Winner
                      </span>
                    )}
                    {entry.credit_granted && (
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                        Credited
                      </span>
                    )}
                    {!entry.winner && !entry.credit_granted && (
                      <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                        Eligible
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actingId === entry.id || entry.credit_granted}
                      onClick={() => updateWinner(entry, !entry.winner)}
                    >
                      {entry.winner ? 'Unselect' : 'Select'}
                    </Button>
                    <Button
                      size="sm"
                      className="bg-accent text-black hover:bg-accent-hover"
                      disabled={actingId === entry.id || !entry.winner || entry.credit_granted}
                      onClick={() => grantCredit(entry)}
                    >
                      Grant $100
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-muted-foreground" colSpan={7}>
                  No Tournament of Champions entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
