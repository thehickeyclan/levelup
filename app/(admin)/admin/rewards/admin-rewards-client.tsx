'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import { ArrowUpDown, Download, Gift, Loader2, X } from 'lucide-react';

type Period = 'this_month' | 'last_month' | 'all';

function money(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ledgerAmountClass(kind: string, rewardType: string | null) {
  if (kind === 'applied' || kind === 'reversal') return 'text-red-600 dark:text-red-400';
  if (rewardType === 'manual' || (!rewardType && kind === 'grant')) return 'text-muted-foreground';
  return 'text-emerald-600 dark:text-emerald-400';
}

export function AdminRewardsClient() {
  const [period, setPeriod] = useState<Period>('this_month');
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const now = new Date();
  const [typeYear, setTypeYear] = useState(now.getFullYear());
  const [typeMonth, setTypeMonth] = useState(now.getMonth() + 1);
  const [byType, setByType] = useState<Record<string, unknown> | null>(null);
  const [typeSort, setTypeSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: 'issued',
    dir: 'desc',
  });

  const [parentQ, setParentQ] = useState('');
  const [parentSort, setParentSort] = useState('balance_desc');
  const [parentPage, setParentPage] = useState(1);
  const [parents, setParents] = useState<{ rows: Record<string, unknown>[]; total: number } | null>(
    null
  );
  const [parentsLoading, setParentsLoading] = useState(true);

  const [sessCoach, setSessCoach] = useState('');
  const [sessTypes, setSessTypes] = useState<string[]>([]);
  const [sessFrom, setSessFrom] = useState('');
  const [sessTo, setSessTo] = useState('');
  const [sessions, setSessions] = useState<{
    rows: Record<string, unknown>[];
    coachOptions: { id: string; name: string }[];
  } | null>(null);

  const [referrals, setReferrals] = useState<Record<string, unknown> | null>(null);
  const [topHolders, setTopHolders] = useState<{ rows: Record<string, unknown>[] } | null>(null);

  const [launchInfo, setLaunchInfo] = useState<Record<string, unknown> | null>(null);
  const [launchDialog, setLaunchDialog] = useState(false);
  const [launchRunning, setLaunchRunning] = useState(false);

  const [panelParent, setPanelParent] = useState<{
    id: string;
    name: string;
    balance: number;
  } | null>(null);
  const [ledger, setLedger] = useState<Record<string, unknown>[]>([]);
  const [ledgerOffset, setLedgerOffset] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [grants, setGrants] = useState<Record<string, unknown>[]>([]);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeCreditId, setRevokeCreditId] = useState('');
  const [revokeAmount, setRevokeAmount] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const r = await fetch(`/api/admin/rewards/summary?period=${period}`);
      const j = await r.json();
      if (r.ok) setSummary(j);
    } finally {
      setSummaryLoading(false);
    }
  }, [period]);

  const fetchByType = useCallback(async () => {
    const r = await fetch(`/api/admin/rewards/by-type?year=${typeYear}&month=${typeMonth}`);
    const j = await r.json();
    if (r.ok) setByType(j);
  }, [typeYear, typeMonth]);

  const fetchParents = useCallback(async () => {
    setParentsLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(parentPage),
        pageSize: '50',
        sort: parentSort,
        q: parentQ,
      });
      const r = await fetch(`/api/admin/rewards/parents?${q}`);
      const j = await r.json();
      if (r.ok) setParents({ rows: j.rows ?? [], total: j.total ?? 0 });
    } finally {
      setParentsLoading(false);
    }
  }, [parentPage, parentSort, parentQ]);

  const fetchSessions = useCallback(async () => {
    const q = new URLSearchParams();
    if (sessCoach) q.set('coachId', sessCoach);
    if (sessTypes.length) q.set('types', sessTypes.join(','));
    if (sessFrom) q.set('from', sessFrom);
    if (sessTo) q.set('to', sessTo);
    const r = await fetch(`/api/admin/rewards/sessions?${q}`);
    const j = await r.json();
    if (r.ok) setSessions({ rows: j.rows ?? [], coachOptions: j.coachOptions ?? [] });
  }, [sessCoach, sessTypes, sessFrom, sessTo]);

  const fetchReferrals = useCallback(async () => {
    const r = await fetch('/api/admin/rewards/referrals');
    const j = await r.json();
    if (r.ok) setReferrals(j);
  }, []);

  const fetchTopHolders = useCallback(async () => {
    const r = await fetch('/api/admin/rewards/top-holders');
    const j = await r.json();
    if (r.ok) setTopHolders({ rows: j.rows ?? [] });
  }, []);

  const fetchLaunch = useCallback(async () => {
    const r = await fetch('/api/admin/rewards/launch-bonus');
    const j = await r.json();
    if (r.ok) setLaunchInfo(j);
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    void fetchByType();
  }, [fetchByType]);

  useEffect(() => {
    const t = setTimeout(() => void fetchParents(), parentQ ? 200 : 0);
    return () => clearTimeout(t);
  }, [fetchParents, parentQ, parentPage, parentSort]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    void fetchReferrals();
  }, [fetchReferrals]);

  useEffect(() => {
    void fetchTopHolders();
  }, [fetchTopHolders]);

  useEffect(() => {
    void fetchLaunch();
  }, [fetchLaunch]);

  const openPanel = async (id: string, name: string, balance: number) => {
    setPanelParent({ id, name, balance });
    setLedger([]);
    setLedgerOffset(0);
    setLedgerLoading(true);
    try {
      const [lr, gr] = await Promise.all([
        fetch(`/api/admin/rewards/parents/${id}/ledger?limit=60&offset=0`),
        fetch(`/api/admin/rewards/parents/${id}/grants`),
      ]);
      const lj = await lr.json();
      const gj = await gr.json();
      if (lr.ok) setLedger((lj.rows ?? []) as Record<string, unknown>[]);
      if (gr.ok) setGrants((gj.grants ?? []) as Record<string, unknown>[]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const loadMoreLedger = async () => {
    if (!panelParent) return;
    const next = ledgerOffset + 60;
    setLedgerLoading(true);
    try {
      const r = await fetch(
        `/api/admin/rewards/parents/${panelParent.id}/ledger?limit=60&offset=${next}`
      );
      const j = await r.json();
      if (r.ok) {
        setLedger((prev) => [...prev, ...((j.rows ?? []) as Record<string, unknown>[])]);
        setLedgerOffset(next);
      }
    } finally {
      setLedgerLoading(false);
    }
  };

  const typeRows = useMemo(() => {
    const rows = (byType?.rows ?? []) as Record<string, unknown>[];
    const dir = typeSort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = Number(a[typeSort.key] ?? 0);
      const bv = Number(b[typeSort.key] ?? 0);
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [byType, typeSort]);

  const issuedBreakdown = summary?.issued as Record<string, unknown> | undefined;
  const bd = (issuedBreakdown?.breakdown ?? {}) as Record<string, number>;

  return (
    <div className="space-y-10 pb-24">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block"
          >
            ← Admin
          </Link>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Gift className="h-8 w-8 text-[#B89D60]" />
            Rewards
          </h1>
          <p className="text-muted-foreground mt-1">
            Platform credits, ledgers, session reconciliation, referrals, launch bonus.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-stretch md:items-end">
          {launchInfo?.legacyPromotionsDisabled ? (
            <p className="text-sm text-muted-foreground max-w-md text-right">{String(launchInfo.message ?? '')}</p>
          ) : launchInfo?.alreadyRan ? (
            <p className="text-sm text-muted-foreground max-w-md text-right">
              Launch bonus issued{' '}
              {formatEST(new Date(String(launchInfo.ranAt)), 'MMM d, yyyy')}
            </p>
          ) : (
            <Button
              variant="outline"
              className="min-h-[44px] border-[#B89D60]/50"
              onClick={() => setLaunchDialog(true)}
            >
              Run Retroactive Launch Bonus
            </Button>
          )}
        </div>
      </div>

      {/* Section 1 — Summary */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Summary period:</span>
          {(['this_month', 'last_month', 'all'] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? 'default' : 'outline'}
              className={period === p ? 'bg-[#B89D60] text-black hover:bg-[#9A8550]' : ''}
              onClick={() => setPeriod(p)}
            >
              {p === 'this_month' ? 'This month' : p === 'last_month' ? 'Last month' : 'All time'}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <p className="text-2xl font-semibold tabular-nums">
                    {money(Number(summary?.totalOutstanding ?? 0))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current liability across all parents
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Issued {period === 'all' ? '(all time)' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <p className="text-2xl font-semibold tabular-nums">
                    {money(Number(issuedBreakdown?.total ?? 0))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Session {money(bd.session ?? 0)} · Referral {money(bd.referral ?? 0)} · Milestone{' '}
                    {money(bd.milestone ?? 0)} · Review {money(bd.review ?? 0)} · Manual{' '}
                    {money(bd.manual ?? 0)}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Redeemed {period === 'all' ? '(all time)' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <p className="text-2xl font-semibold tabular-nums">
                    {money(Number(summary?.redeemedThisPeriod ?? 0))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Applied at checkout</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending referrals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <p className="text-2xl font-semibold tabular-nums">
                    {Number((summary?.pendingReferrals as Record<string, unknown>)?.count ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {money(
                      Number((summary?.pendingReferrals as Record<string, unknown>)?.holdTotalUsd ?? 0)
                    )}{' '}
                    total in hold
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 2 — By type */}
      <section>
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <CardTitle>Credits by type</CardTitle>
                <CardDescription>Issuance and redemption for the selected calendar month (Eastern).</CardDescription>
              </div>
              <div className="flex gap-2 items-center">
                <Label className="sr-only">Month</Label>
                <Input
                  type="month"
                  className="w-[200px]"
                  value={`${typeYear}-${String(typeMonth).padStart(2, '0')}`}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const [y, m] = v.split('-').map(Number);
                    setTypeYear(y);
                    setTypeMonth(m);
                  }}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Type</th>
                  {(['issued', 'redeemed', 'outstanding'] as const).map((k) => (
                    <th key={k} className="py-2 pr-4">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() =>
                          setTypeSort((s) => ({
                            key: k,
                            dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc',
                          }))
                        }
                      >
                        {k[0].toUpperCase() + k.slice(1)}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {typeRows.map((r) => (
                  <tr key={String(r.type)} className="border-b border-border/60">
                    <td className="py-2 pr-4 font-medium">{String(r.label)}</td>
                    <td className="py-2 pr-4 tabular-nums">{money(Number(r.issued))}</td>
                    <td className="py-2 pr-4 tabular-nums">{money(Number(r.redeemed))}</td>
                    <td className="py-2 pr-4 tabular-nums">{money(Number(r.outstanding))}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {money(Number((byType?.totals as Record<string, unknown>)?.issued ?? 0))}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {money(Number((byType?.totals as Record<string, unknown>)?.redeemed ?? 0))}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {money(Number((byType?.totals as Record<string, unknown>)?.outstanding ?? 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Section 3 — Parents */}
      <section>
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Parent credits</CardTitle>
              <CardDescription>Operational view — search, sort, export.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search parent name"
                value={parentQ}
                onChange={(e) => {
                  setParentQ(e.target.value);
                  setParentPage(1);
                }}
                className="max-w-xs min-h-[44px]"
              />
              <Select
                value={parentSort}
                onValueChange={(v) => {
                  setParentSort(v);
                  setParentPage(1);
                }}
              >
                <SelectTrigger className="w-[200px] min-h-[44px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balance_desc">Balance (high → low)</SelectItem>
                  <SelectItem value="balance_asc">Balance (low → high)</SelectItem>
                  <SelectItem value="name_asc">Name A–Z</SelectItem>
                  <SelectItem value="name_desc">Name Z–A</SelectItem>
                  <SelectItem value="sessions_desc">Sessions</SelectItem>
                  <SelectItem value="earned_desc">Total earned</SelectItem>
                  <SelectItem value="activity_desc">Last activity</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  const headers = [
                    'Parent',
                    'Sessions',
                    'Earned',
                    'Redeemed',
                    'Balance',
                    'Last activity',
                  ];
                  void (async () => {
                    const r = await fetch(
                      `/api/admin/rewards/parents?page=1&pageSize=10000&sort=${parentSort}&q=${encodeURIComponent(parentQ)}`
                    );
                    const j = await r.json();
                    const rows = (j.rows ?? []) as Record<string, unknown>[];
                    downloadCsv(
                      'guild-parent-credits.csv',
                      headers,
                      rows.map((x) => [
                        String(x.parent_name ?? ''),
                        x.session_count as number,
                        Number(x.total_earned).toFixed(2),
                        Number(x.total_redeemed).toFixed(2),
                        Number(x.current_balance).toFixed(2),
                        x.last_activity ? formatEST(new Date(String(x.last_activity)), 'yyyy-MM-dd') : '',
                      ])
                    );
                  })();
                }}
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {parentsLoading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 sticky left-0 bg-card z-10">Parent</th>
                    <th className="py-2 pr-3">Sessions</th>
                    <th className="py-2 pr-3">Earned</th>
                    <th className="py-2 pr-3">Redeemed</th>
                    <th className="py-2 pr-3 sticky right-0 bg-card z-10">Balance</th>
                    <th className="py-2 pr-3">Last</th>
                    <th className="py-2 pr-3 sticky right-0 bg-card z-10 w-[88px]"> </th>
                  </tr>
                </thead>
                <tbody>
                  {(parents?.rows ?? []).map((p) => (
                    <tr key={String(p.id)} className="border-b border-border/60">
                      <td className="py-2 pr-3 sticky left-0 bg-card font-medium">{String(p.parent_name)}</td>
                      <td className="py-2 pr-3 tabular-nums">{Number(p.session_count)}</td>
                      <td className="py-2 pr-3 tabular-nums">{money(Number(p.total_earned))}</td>
                      <td className="py-2 pr-3 tabular-nums">{money(Number(p.total_redeemed))}</td>
                      <td className="py-2 pr-3 tabular-nums sticky right-0 bg-card font-medium">
                        {money(Number(p.current_balance))}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                        {p.last_activity
                          ? formatEST(new Date(String(p.last_activity)), 'MMM d')
                          : '—'}
                      </td>
                      <td className="py-2 pr-3 sticky right-0 bg-card">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-[44px]"
                          onClick={() =>
                            openPanel(
                              String(p.id),
                              String(p.parent_name),
                              Number(p.current_balance)
                            )
                          }
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                {parents ? `${parents.total} parents` : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={parentPage <= 1}
                  onClick={() => setParentPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!parents || parentPage * 50 >= parents.total}
                  onClick={() => setParentPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Section 4 — Sessions */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Sessions with credits</CardTitle>
            <CardDescription>Reconciliation — paid roster rows, usage split when shared session.</CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <Select
                value={sessCoach || '__all'}
                onValueChange={(v) => setSessCoach(v === '__all' ? '' : v)}
              >
                <SelectTrigger className="w-[220px] min-h-[44px]">
                  <SelectValue placeholder="Coach" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All coaches</SelectItem>
                  {(sessions?.coachOptions ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={sessFrom}
                onChange={(e) => setSessFrom(e.target.value)}
                className="w-[160px] min-h-[44px]"
              />
              <Input
                type="date"
                value={sessTo}
                onChange={(e) => setSessTo(e.target.value)}
                className="w-[160px] min-h-[44px]"
              />
              <Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => void fetchSessions()}>
                Apply
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  const headers = [
                    'Date',
                    'Coach',
                    'Type',
                    'Parent',
                    'List price',
                    'Credits applied',
                    'Cash collected',
                    'Credit earned',
                  ];
                  downloadCsv(
                    'guild-session-credits.csv',
                    headers,
                    (sessions?.rows ?? []).map((r) => [
                      formatEST(new Date(String(r.session_date)), 'yyyy-MM-dd'),
                      String(r.coach_name),
                      getSessionTypeDisplay(String(r.session_type ?? '')).label,
                      String(r.parent_name),
                      Number(r.list_price).toFixed(2),
                      Number(r.credits_applied).toFixed(2),
                      Number(r.cash_collected).toFixed(2),
                      Number(r.session_credit_earned).toFixed(2),
                    ])
                  );
                }}
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {Array.from(new Set((sessions?.rows ?? []).map((r) => String(r.session_type ?? '')))).map(
                (t) =>
                  t ? (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={sessTypes.includes(t) ? 'default' : 'outline'}
                      className={sessTypes.includes(t) ? 'bg-[#B89D60] text-black' : ''}
                      onClick={() => {
                        setSessTypes((prev) =>
                          prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                        );
                      }}
                    >
                      {getSessionTypeDisplay(t).label}
                    </Button>
                  ) : null
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Coach</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Parent</th>
                  <th className="py-2 pr-3">List</th>
                  <th className="py-2 pr-3">Credits</th>
                  <th className="py-2 pr-3">Cash</th>
                  <th className="py-2 pr-3">Earned</th>
                </tr>
              </thead>
              <tbody>
                {(sessions?.rows ?? []).map((r, i) => (
                  <tr key={`${r.participant_id}-${i}`} className="border-b border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {formatEST(new Date(String(r.session_date)), 'MMM d, yyyy')}
                    </td>
                    <td className="py-2 pr-3">{String(r.coach_name)}</td>
                    <td className="py-2 pr-3">
                      {getSessionTypeDisplay(String(r.session_type ?? '')).label}
                    </td>
                    <td className="py-2 pr-3">{String(r.parent_name)}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(Number(r.list_price))}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(Number(r.credits_applied))}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(Number(r.cash_collected))}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(Number(r.session_credit_earned))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Section 5 & 6 — Referrals + top holders */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Referrals</CardTitle>
              {(() => {
                const sm = referrals?.summary as
                  | {
                      thisMonth?: { completed?: number; pending?: number; expired?: number };
                      totalReferralCreditsIssued?: number;
                      creditsInHold?: number;
                    }
                  | undefined;
                return (
                  <p className="text-sm text-muted-foreground">
                    This month: {sm?.thisMonth?.completed ?? 0} completed · {sm?.thisMonth?.pending ?? 0}{' '}
                    pending · {sm?.thisMonth?.expired ?? 0} expired
                    <br />
                    Total referral credits issued: {money(Number(sm?.totalReferralCreditsIssued ?? 0))}
                    <br />
                    Credits in hold: {money(Number(sm?.creditsInHold ?? 0))}
                  </p>
                );
              })()}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2">Referrer</th>
                    <th className="py-2 pr-2">Referred</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Released</th>
                    <th className="py-2 pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {((referrals?.rows ?? []) as Record<string, unknown>[]).map((row) => {
                    const disp = row.display as Record<string, unknown> | undefined;
                    const tone = String(disp?.tone ?? 'muted');
                    return (
                      <tr key={String(row.id)} className="border-b border-border/60">
                        <td className="py-2 pr-2">{String(row.referrer_name)}</td>
                        <td className="py-2 pr-2">{String(row.referred_name)}</td>
                        <td className="py-2 pr-2">
                          <Badge
                            variant="outline"
                            className={
                              tone === 'yellow'
                                ? 'border-amber-500 text-amber-700'
                                : tone === 'green'
                                  ? 'border-emerald-600 text-emerald-700'
                                  : tone === 'red'
                                    ? 'border-red-600 text-red-700'
                                    : ''
                            }
                          >
                            {String(disp?.label ?? row.status)}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 text-xs">{String(row.released_label)}</td>
                        <td className="py-2 pr-2">
                          <div className="flex flex-wrap gap-1">
                            {row.status === 'awaiting_release' && (
                              <ReferralReleaseButton
                                id={String(row.id)}
                                onDone={() => void fetchReferrals()}
                              />
                            )}
                            {row.status !== 'flagged' ? (
                              <ReferralFlagButton
                                id={String(row.id)}
                                onDone={() => void fetchReferrals()}
                              />
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="min-h-[44px]"
                                onClick={async () => {
                                  await fetch(`/api/admin/rewards/referrals/${row.id}/unflag`, {
                                    method: 'POST',
                                  });
                                  void fetchReferrals();
                                }}
                              >
                                Unflag
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Top referrers</CardTitle>
              <CardDescription>All-time by referral credit earned</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {((referrals?.topReferrers ?? []) as Record<string, unknown>[]).map(
                (t: Record<string, unknown>, i: number) => (
                  <div key={String(t.id)} className="flex justify-between gap-2">
                    <span>
                      {i + 1}. {String(t.name)}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {Number(t.referrals)} ref · {money(Number(t.earned))}
                    </span>
                  </div>
                )
              )}
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Highest wallet balances</CardTitle>
              <CardDescription>Top 10 — tap to open ledger</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(topHolders?.rows ?? []).map((h: Record<string, unknown>, i: number) => (
                <button
                  key={String(h.id)}
                  type="button"
                  className="w-full flex justify-between gap-2 text-left hover:bg-muted/40 rounded-md px-2 py-2 min-h-[44px]"
                  onClick={() =>
                    openPanel(String(h.id), String(h.name), Number(h.balance))
                  }
                >
                  <span>
                    {i + 1}. {String(h.name)}
                  </span>
                  <span className="text-muted-foreground text-right">
                    {money(Number(h.balance))}
                    <span className="block text-xs">
                      Last booked:{' '}
                      {h.last_booked
                        ? formatEST(new Date(String(h.last_booked)), 'MMM d')
                        : '—'}
                    </span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Slide-over panel */}
      {panelParent && (
        <div className="fixed inset-0 z-[100] flex">
          <button
            type="button"
            className="hidden md:block flex-1 bg-black/50"
            aria-label="Close panel"
            onClick={() => setPanelParent(null)}
          />
          <div className="w-full md:max-w-xl md:shadow-2xl bg-background border-l flex flex-col max-h-full overflow-hidden">
            <div className="p-4 border-b flex items-start justify-between gap-2">
              <div>
                <h2 className="font-serif text-lg font-semibold">{panelParent.name} — Credit ledger</h2>
                <p className="text-sm text-muted-foreground">
                  Current balance: {money(panelParent.balance)}
                </p>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setPanelParent(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex gap-2 p-3 border-b flex-wrap">
              <Button type="button" size="sm" className="min-h-[44px]" onClick={() => setManualOpen(true)}>
                Issue manual credit
              </Button>
              <Button type="button" size="sm" variant="outline" className="min-h-[44px]" onClick={() => setRevokeOpen(true)}>
                Revoke credit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-[44px]"
                disabled={actionLoading}
                onClick={async () => {
                  if (!panelParent) return;
                  if (
                    !confirm(
                      'Restore credits for sessions where this parent has wallet debits but no roster row? (Failed registration fix.)'
                    )
                  )
                    return;
                  setActionLoading(true);
                  try {
                    const r = await fetch(
                      `/api/admin/rewards/parents/${panelParent.id}/reverse-orphaned-booking-credits`,
                      { method: 'POST' }
                    );
                    const j = await r.json().catch(() => ({}));
                    if (r.ok) {
                      alert(
                        `Restored $${Number(j.restoredUsd ?? 0).toFixed(2)} (${Number(j.reversedUsageRowCount ?? 0)} usage rows). Balance: $${Number(j.balanceAfter ?? 0).toFixed(2)}.`
                      );
                      await openPanel(
                        panelParent.id,
                        panelParent.name,
                        Number(j.balanceAfter ?? panelParent.balance)
                      );
                      void fetchParents();
                      void fetchSummary();
                    } else {
                      alert(typeof j.error === 'string' ? j.error : 'Request failed');
                    }
                  } finally {
                    setActionLoading(false);
                  }
                }}
              >
                Restore failed booking credits
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {ledgerLoading && ledger.length === 0 ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-2">Date</th>
                      <th className="py-2 pr-2">Kind</th>
                      <th className="py-2 pr-2">Description</th>
                      <th className="py-2 pr-2 text-right">Amt</th>
                      <th className="py-2 pr-2 text-right">Bal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => (
                      <tr key={`${row.entry_id}-${row.entry_ts}`} className="border-b border-border/50">
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {formatEST(new Date(String(row.entry_ts)), 'MMM d')}
                        </td>
                        <td className="py-2 pr-2">
                          {String(row.reward_type ?? row.entry_kind)}
                        </td>
                        <td className="py-2 pr-2 max-w-[140px] truncate">{String(row.description)}</td>
                        <td
                          className={`py-2 pr-2 text-right tabular-nums ${ledgerAmountClass(
                            String(row.entry_kind),
                            row.reward_type ? String(row.reward_type) : null
                          )}`}
                        >
                          {(() => {
                            const a = Number(row.amount);
                            const sign = a >= 0 ? '+' : '−';
                            return `${sign}$${Math.abs(a).toFixed(2)}`;
                          })()}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                          {money(Number(row.balance_after))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full min-h-[44px]"
                disabled={ledgerLoading}
                onClick={() => void loadMoreLedger()}
              >
                {ledgerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load older entries'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue manual credit</DialogTitle>
            <DialogDescription>Grants wallet credit with audit trail (reward type manual).</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Amount (USD)</Label>
            <Input
              inputMode="decimal"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
            />
            <Label>Reason</Label>
            <Textarea value={manualReason} onChange={(e) => setManualReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#B89D60] text-black"
              disabled={actionLoading}
              onClick={async () => {
                if (!panelParent) return;
                if (!confirm('Issue this credit to the parent?')) return;
                setActionLoading(true);
                try {
                  const r = await fetch(`/api/admin/rewards/parents/${panelParent.id}/manual-credit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      amount: parseFloat(manualAmount),
                      reason: manualReason,
                    }),
                  });
                  if (r.ok) {
                    setManualOpen(false);
                    setManualAmount('');
                    setManualReason('');
                    await openPanel(panelParent.id, panelParent.name, panelParent.balance);
                    void fetchParents();
                    void fetchSummary();
                  } else {
                    const j = await r.json();
                    alert(j.error || 'Failed');
                  }
                } finally {
                  setActionLoading(false);
                }
              }}
            >
              Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke credit</DialogTitle>
            <DialogDescription>Reduces remaining on a grant and logs credit_reversals.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Grant</Label>
            <Select value={revokeCreditId} onValueChange={setRevokeCreditId}>
              <SelectTrigger>
                <SelectValue placeholder="Select grant row" />
              </SelectTrigger>
              <SelectContent>
                {grants.map((g) => (
                  <SelectItem key={String(g.id)} value={String(g.id)}>
                    {String(g.description ?? g.reward_type)} — remaining {money(Number(g.remaining))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label>Amount to revoke</Label>
            <Input
              inputMode="decimal"
              value={revokeAmount}
              onChange={(e) => setRevokeAmount(e.target.value)}
            />
            <Label>Reason</Label>
            <Textarea value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRevokeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={actionLoading}
              onClick={async () => {
                if (!panelParent) return;
                if (!confirm('Revoke this amount from the selected grant?')) return;
                setActionLoading(true);
                try {
                  const r = await fetch(`/api/admin/rewards/parents/${panelParent.id}/revoke`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      credit_id: revokeCreditId,
                      amount: parseFloat(revokeAmount),
                      reason: revokeReason,
                    }),
                  });
                  if (r.ok) {
                    setRevokeOpen(false);
                    setRevokeAmount('');
                    setRevokeReason('');
                    await openPanel(panelParent.id, panelParent.name, panelParent.balance);
                    void fetchParents();
                    void fetchSummary();
                  } else {
                    const j = await r.json();
                    alert(j.error || 'Failed');
                  }
                } finally {
                  setActionLoading(false);
                }
              }}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={launchDialog} onOpenChange={setLaunchDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Retroactive launch bonus</DialogTitle>
            <DialogDescription>
              Credits 5% of roster amount_paid for paid spots that do not already have session_earned. Safe to
              preview; run issues grants and notifies parents. Requires REWARDS_LEGACY_PROMOTION_CREDITS_ENABLED=true.
            </DialogDescription>
          </DialogHeader>
          {launchInfo && Boolean(launchInfo.legacyPromotionsDisabled) && (
            <p className="text-sm text-muted-foreground">{String(launchInfo.message ?? '')}</p>
          )}
          {launchInfo && !launchInfo.alreadyRan && !launchInfo.legacyPromotionsDisabled && (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p>Parents affected: {Number((launchInfo.preview as Record<string, unknown>)?.parentsAffected ?? 0)}</p>
              <p>Sessions: {Number((launchInfo.preview as Record<string, unknown>)?.sessionsToCredit ?? 0)}</p>
              <p>
                Total credit:{' '}
                {money(Number((launchInfo.preview as Record<string, unknown>)?.totalCreditUsd ?? 0))}
              </p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => setLaunchDialog(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#B89D60] text-black"
              disabled={launchRunning || !!launchInfo?.alreadyRan || !!launchInfo?.legacyPromotionsDisabled}
              onClick={async () => {
                if (launchInfo?.legacyPromotionsDisabled) return;
                const amt = Number((launchInfo?.preview as Record<string, unknown>)?.totalCreditUsd ?? 0);
                const parents = Number((launchInfo?.preview as Record<string, unknown>)?.parentsAffected ?? 0);
                if (
                  !confirm(
                    `You are about to issue ${money(amt)} in retroactive credits to ${parents} parents. This cannot be undone. Continue?`
                  )
                ) {
                  return;
                }
                setLaunchRunning(true);
                try {
                  const r = await fetch('/api/admin/rewards/launch-bonus', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirm: true }),
                  });
                  const j = await r.json();
                  if (r.ok) {
                    alert(
                      `Issued ${j.sessionsCredited} credits to ${j.parentsAffected} parents — ${money(Number(j.totalUsd))}`
                    );
                    setLaunchDialog(false);
                    void fetchLaunch();
                    void fetchSummary();
                    void fetchParents();
                  } else {
                    alert(j.error || 'Failed');
                  }
                } finally {
                  setLaunchRunning(false);
                }
              }}
            >
              {launchRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm run'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReferralReleaseButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" className="min-h-[44px]" onClick={() => setOpen(true)}>
        Release early
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release referral credit early</DialogTitle>
            <DialogDescription>Bypasses the referral hold (3 days). Reason is required.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const r = await fetch(`/api/admin/rewards/referrals/${id}/release`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason }),
                  });
                  if (r.ok) {
                    setOpen(false);
                    onDone();
                  } else {
                    const j = await r.json();
                    alert(j.error || 'Failed');
                  }
                } finally {
                  setLoading(false);
                }
              }}
            >
              Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReferralFlagButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="min-h-[44px]" onClick={() => setOpen(true)}>
        Flag
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag referral</DialogTitle>
            <DialogDescription>Freezes pending referral credit. Admin note required.</DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  const r = await fetch(`/api/admin/rewards/referrals/${id}/flag`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note }),
                  });
                  if (r.ok) {
                    setOpen(false);
                    onDone();
                  } else {
                    const j = await r.json();
                    alert(j.error || 'Failed');
                  }
                } finally {
                  setLoading(false);
                }
              }}
            >
              Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
