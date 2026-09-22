'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, ShieldAlert, Trash2, UserX, Undo2, CheckCircle2, XCircle, Flag } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatEST } from '@/lib/format-date';
import type { AccountFootprint } from '@/lib/account-deletion';

export type DeletionRequestRow = {
  id: string;
  user_id: string;
  email: string;
  role: string | null;
  status: string;
  requested_at: string;
  completed_at: string | null;
  notes: string | null;
  display_name: string | null;
  account_exists: boolean;
  footprint: AccountFootprint | null;
};

export type ReportMessage = { id: string; sender: string; body: string; created_at: string };

export type ContentReportRow = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  is_block: boolean;
  reporter: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  target_summary: string | null;
  messages: ReportMessage[] | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function footprintChips(fp: AccountFootprint): { label: string; count: number }[] {
  return [
    { label: 'coach sessions', count: fp.coach_sessions },
    { label: 'parent bookings', count: fp.parent_bookings },
    { label: 'market listings', count: fp.market_listings },
    { label: 'market orders', count: fp.market_orders },
    { label: 'message threads', count: fp.message_threads },
    { label: 'wallet credits', count: fp.wallet_credit_rows },
  ];
}

function isZero(fp: AccountFootprint): boolean {
  return footprintChips(fp).every((c) => c.count === 0) && fp.wallet_credit_balance === 0;
}

type PendingAction =
  | { kind: 'deletion'; id: string; action: 'purge' | 'anonymize' | 'cancel'; label: string; description: string; destructive: boolean }
  | { kind: 'report'; id: string; action: 'resolve' | 'dismiss'; label: string; description: string; destructive: boolean };

export function ComplianceClient({
  deletionRequests,
  deletionTableMissing,
  contentReports,
  reportsTableMissing,
}: {
  deletionRequests: DeletionRequestRow[];
  deletionTableMissing: boolean;
  contentReports: ContentReportRow[];
  reportsTableMissing: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = (action: PendingAction) => {
    setError(null);
    setNotes('');
    setPending(action);
  };

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const url =
        pending.kind === 'deletion'
          ? `/api/admin/deletion-requests/${pending.id}`
          : `/api/admin/content-reports/${pending.id}`;
      const payload =
        pending.kind === 'deletion'
          ? { action: pending.action }
          : { action: pending.action, notes };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }
      setPending(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const pendingDeletions = deletionRequests.filter((r) => r.status === 'pending');
  const closedDeletions = deletionRequests.filter((r) => r.status !== 'pending');
  const openIncidents = contentReports.filter((r) => r.status === 'pending' && !r.is_block);
  const openBlocks = contentReports.filter((r) => r.status === 'pending' && r.is_block);
  const closedReports = contentReports.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-8">
      {/* ---------- Account deletion requests ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5" />
            Account deletion requests
          </CardTitle>
          <CardDescription>
            Apple requires completion within 30 days of the in-app request. Zero-footprint accounts
            can be purged outright; accounts with history are anonymized so financial and session
            records survive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deletionTableMissing && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              The <code>account_deletion_requests</code> table does not exist in this database yet.
              Apply the migration SQL, then reload this page. New in-app requests still lock the
              account and notify admins meanwhile.
            </div>
          )}

          {!deletionTableMissing && pendingDeletions.length === 0 && (
            <p className="text-muted-foreground text-sm">No pending deletion requests. 🎉</p>
          )}

          {pendingDeletions.map((r) => {
            const requested = new Date(r.requested_at);
            const deadline = new Date(requested.getTime() + 30 * DAY_MS);
            const daysLeft = Math.floor((deadline.getTime() - Date.now()) / DAY_MS);
            const zero = r.footprint ? isZero(r.footprint) : false;
            return (
              <div key={r.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {r.display_name ? `${r.display_name} — ` : ''}
                      {r.email}
                      {r.role ? <span className="text-muted-foreground"> ({r.role})</span> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Requested {formatEST(requested, 'MMM d, yyyy')} · due{' '}
                      {formatEST(deadline, 'MMM d, yyyy')}{' '}
                      <span className={daysLeft < 7 ? 'text-red-500 font-medium' : ''}>
                        ({daysLeft < 0 ? 'OVERDUE' : `${daysLeft} days left`})
                      </span>
                    </p>
                  </div>
                  {zero ? (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Zero footprint</Badge>
                  ) : (
                    <Badge variant="secondary">Has history</Badge>
                  )}
                </div>

                {!r.account_exists && (
                  <p className="text-sm text-amber-600">
                    No users row found for this account — it may already be partially deleted.
                  </p>
                )}

                {r.footprint && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {footprintChips(r.footprint).map((c) => (
                      <span
                        key={c.label}
                        className={`rounded-full border px-2 py-0.5 ${
                          c.count > 0
                            ? 'border-foreground/30 text-foreground'
                            : 'border-border text-muted-foreground'
                        }`}
                      >
                        {c.count} {c.label}
                      </span>
                    ))}
                    {r.footprint.wallet_credit_balance > 0 && (
                      <span className="rounded-full border border-foreground/30 px-2 py-0.5">
                        ${r.footprint.wallet_credit_balance.toFixed(2)} credit balance
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!zero}
                    title={zero ? undefined : 'Only zero-footprint accounts can be purged'}
                    onClick={() =>
                      confirm({
                        kind: 'deletion',
                        id: r.id,
                        action: 'purge',
                        label: `Permanently purge ${r.email}`,
                        description:
                          'Deletes the athletes row, the users row, and the auth login. This cannot be undone. The request row is kept as the audit record.',
                        destructive: true,
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Purge permanently
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      confirm({
                        kind: 'deletion',
                        id: r.id,
                        action: 'anonymize',
                        label: `Anonymize ${r.email}`,
                        description:
                          'Replaces name with “Deleted User”, strips email, phone, photos, payout handles and kids’ personal data, then removes the login (soft delete). Session and financial records are preserved.',
                        destructive: true,
                      })
                    }
                  >
                    <ShieldAlert className="h-4 w-4 mr-1" /> Anonymize &amp; remove login
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      confirm({
                        kind: 'deletion',
                        id: r.id,
                        action: 'cancel',
                        label: `Cancel request for ${r.email}`,
                        description:
                          'Lifts the login ban and closes the request. Use when the request was accidental and the user wants their account back.',
                        destructive: false,
                      })
                    }
                  >
                    <Undo2 className="h-4 w-4 mr-1" /> Cancel &amp; restore access
                  </Button>
                </div>
              </div>
            );
          })}

          {closedDeletions.length > 0 && (
            <details className="pt-2">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                Completed ({closedDeletions.length})
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Account</th>
                      <th className="p-2 font-medium">Outcome</th>
                      <th className="p-2 font-medium">Requested</th>
                      <th className="p-2 font-medium">Completed</th>
                      <th className="p-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedDeletions.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 align-top">
                        <td className="p-2">{r.email}</td>
                        <td className="p-2">
                          <Badge variant={r.status === 'cancelled' ? 'secondary' : 'default'}>{r.status}</Badge>
                        </td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                          {formatEST(new Date(r.requested_at), 'MMM d, yyyy')}
                        </td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                          {r.completed_at ? formatEST(new Date(r.completed_at), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="p-2 text-muted-foreground max-w-md">{r.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* ---------- Content reports ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Content reports
          </CardTitle>
          <CardDescription>
            User-generated content reports must be reviewed within 24 hours. Blocks are FYI-only
            preference signals, listed separately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reportsTableMissing && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              The <code>content_reports</code> table does not exist in this database yet. Apply the
              migration SQL (it backfills historical reports from notifications), then reload.
            </div>
          )}

          {!reportsTableMissing && openIncidents.length === 0 && (
            <p className="text-muted-foreground text-sm">No open reports. 🎉</p>
          )}

          {openIncidents.map((r) => {
            const created = new Date(r.created_at);
            const breached = Date.now() - created.getTime() > DAY_MS;
            return (
              <div key={r.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium capitalize">
                      {r.target_type} report
                      <span className="text-muted-foreground font-normal"> · by {r.reporter}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatEST(created, 'MMM d, yyyy h:mm a')} ·{' '}
                      {formatDistanceToNow(created, { addSuffix: true })}
                    </p>
                  </div>
                  {breached ? (
                    <Badge variant="destructive">24h SLA breached</Badge>
                  ) : (
                    <Badge variant="secondary">Within SLA</Badge>
                  )}
                </div>

                {r.reason && <p className="text-sm">Reason: “{r.reason}”</p>}
                {r.target_summary && <p className="text-sm text-muted-foreground">{r.target_summary}</p>}

                {r.messages && r.messages.length > 0 && (
                  <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    {r.messages.map((m) => (
                      <div key={m.id} className="text-sm">
                        <span className="font-medium">{m.sender}</span>{' '}
                        <span className="text-xs text-muted-foreground">
                          {formatEST(new Date(m.created_at), 'MMM d, h:mm a')}
                        </span>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                {r.messages && r.messages.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    Thread is empty — likely an accidental report.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      confirm({
                        kind: 'report',
                        id: r.id,
                        action: 'resolve',
                        label: 'Resolve report',
                        description:
                          'Marks the report reviewed and handled. Add a note describing what was done (or why no action was needed).',
                        destructive: false,
                      })
                    }
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      confirm({
                        kind: 'report',
                        id: r.id,
                        action: 'dismiss',
                        label: 'Dismiss report',
                        description: 'Closes the report without action (e.g. accidental or unfounded).',
                        destructive: false,
                      })
                    }
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Dismiss
                  </Button>
                </div>
              </div>
            );
          })}

          {openBlocks.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                User blocks — FYI only ({openBlocks.length})
              </summary>
              <div className="mt-3 space-y-2">
                {openBlocks.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
                    <span>
                      {r.reporter} blocked a {r.target_type} ·{' '}
                      <span className="text-muted-foreground">
                        {formatEST(new Date(r.created_at), 'MMM d, yyyy')}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        confirm({
                          kind: 'report',
                          id: r.id,
                          action: 'dismiss',
                          label: 'Acknowledge block',
                          description: 'Closes this FYI entry. No action is expected for blocks.',
                          destructive: false,
                        })
                      }
                    >
                      Acknowledge
                    </Button>
                  </div>
                ))}
              </div>
            </details>
          )}

          {closedReports.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                Closed ({closedReports.length})
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2 font-medium">Target</th>
                      <th className="p-2 font-medium">Reporter</th>
                      <th className="p-2 font-medium">Outcome</th>
                      <th className="p-2 font-medium">Reported</th>
                      <th className="p-2 font-medium">Closed</th>
                      <th className="p-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedReports.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 align-top">
                        <td className="p-2 capitalize">
                          {r.is_block ? `block (${r.target_type})` : r.target_type}
                        </td>
                        <td className="p-2">{r.reporter}</td>
                        <td className="p-2">
                          <Badge variant={r.status === 'resolved' ? 'default' : 'secondary'}>{r.status}</Badge>
                        </td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                          {formatEST(new Date(r.created_at), 'MMM d, yyyy')}
                        </td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                          {r.resolved_at ? formatEST(new Date(r.resolved_at), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="p-2 text-muted-foreground max-w-md">{r.resolution_notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* ---------- Confirm dialog ---------- */}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.label}</DialogTitle>
            <DialogDescription>{pending?.description}</DialogDescription>
          </DialogHeader>
          {pending?.kind === 'report' && (
            <Textarea
              placeholder="Resolution notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
              Back
            </Button>
            <Button
              variant={pending?.destructive ? 'destructive' : 'default'}
              disabled={busy}
              onClick={run}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
