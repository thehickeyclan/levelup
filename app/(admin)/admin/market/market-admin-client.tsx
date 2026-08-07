'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageThread } from '@/components/guild/message-thread';
import { cn } from '@/lib/utils';

export type AdminMarketOrder = {
  id: string;
  order_ref: string;
  listing_title: string;
  buyer_label: string;
  buyer_contact: string;
  seller_label: string;
  seller_contact: string;
  payout_recipient_label: string;
  payout_contact: string;
  amount_cents: number;
  shipping_cents: number;
  platform_fee_cents: number;
  seller_payout_cents: number;
  status: string;
  created_at: string;
  updated_at: string;
  seller_paid_at: string | null;
  seller_payout_method: string | null;
  seller_payout_reference: string | null;
  seller_payout_note: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  thread_id: string | null;
};

export type AdminMarketTrade = {
  id: string;
  initiator_listing: string;
  receiver_listing: string;
  boot_amount_cents: number;
  status: string;
  initiator_fee_paid: boolean;
  receiver_fee_paid: boolean;
  created_at: string;
  thread_id: string | null;
};

export type AdminMarketOffer = {
  id: string;
  listing_title: string;
  buyer_label: string;
  offer_type: string;
  amount_cents: number | null;
  trade_listing_title: string | null;
  status: string;
  expires_at: string;
};

export type AdminAiCostRow = {
  day: string;
  route: string;
  call_count: number;
  total_tokens: number;
  cost_cents: number;
};

const payoutReadyStatuses = new Set(['completed']);

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function shortDate(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusTone(status: string) {
  if (status === 'completed') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  if (status === 'paid' || status === 'shipped') return 'bg-blue-500/10 text-blue-300 border-blue-500/30';
  if (status === 'disputed') return 'bg-red-500/10 text-red-300 border-red-500/30';
  if (status === 'cancelled' || status === 'refunded') return 'bg-muted text-muted-foreground border-border';
  return 'bg-accent/10 text-accent border-accent/30';
}

export function MarketAdminClient({
  orders,
  trades,
  offers,
  aiCosts,
  aiTotalCents,
  adminUserId,
}: {
  orders: AdminMarketOrder[];
  trades: AdminMarketTrade[];
  offers: AdminMarketOffer[];
  aiCosts: AdminAiCostRow[];
  aiTotalCents: number;
  adminUserId: string;
}) {
  const [tab, setTab] = useState<'payouts' | 'orders' | 'trades' | 'offers' | 'ai'>('payouts');
  const [acting, setActing] = useState<string | null>(null);
  const [viewThreadId, setViewThreadId] = useState<string | null>(null);
  const payoutDueOrders = orders.filter((o) => payoutReadyStatuses.has(o.status) && !o.seller_paid_at);
  const paidOutOrders = orders.filter((o) => o.seller_paid_at);
  const payoutDueCents = payoutDueOrders.reduce((sum, o) => sum + o.seller_payout_cents, 0);
  const grossSalesCents = orders
    .filter((o) => !['cancelled', 'refunded', 'pending_payment'].includes(o.status))
    .reduce((sum, o) => sum + o.amount_cents, 0);
  const platformFeeCents = orders
    .filter((o) => !['cancelled', 'refunded', 'pending_payment'].includes(o.status))
    .reduce((sum, o) => sum + o.platform_fee_cents, 0);

  const markPaid = async (order: AdminMarketOrder) => {
    const reference = window.prompt(
      `Paste the Venmo/Zelle/check reference or short note for paying ${order.payout_recipient_label} ${money(order.seller_payout_cents)}:`,
      order.seller_payout_reference ?? ''
    );
    if (reference === null) return;
    const method =
      window.prompt('Payout method? venmo, zelle, cash, check, or other:', order.seller_payout_method ?? 'venmo') ??
      'other';

    setActing(order.id);
    try {
      const res = await fetch(`/api/admin/market/${order.id}/payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          reference,
          note: `Manual payout recorded from Market Ops for ${order.order_ref}`,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(null);
    }
  };

  const copyPayout = async (order: AdminMarketOrder) => {
    const text = [
      `Order: ${order.order_ref}`,
      `Listing: ${order.listing_title}`,
      `Pay: ${order.payout_recipient_label}`,
      `Amount: ${money(order.seller_payout_cents)}`,
      `Contact: ${order.payout_contact}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
  };

  const cancelTrade = async (tradeId: string) => {
    if (!window.confirm('Cancel this trade, refund any paid fee, and reactivate both listings?')) return;
    setActing(tradeId);
    try {
      const res = await fetch(`/api/admin/market/trades/${tradeId}/cancel`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
        {(['payouts', 'orders', 'trades', 'offers', 'ai'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm capitalize',
              tab === t ? 'bg-accent text-black' : 'border border-border text-muted-foreground'
            )}
          >
            {t === 'ai' ? 'AI costs' : t}
          </button>
        ))}
        </div>
        <Link
          href="/admin/market/shoe-id"
          className="text-sm text-accent hover:underline shrink-0"
        >
          Shoe ID training →
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Payouts due</div>
          <div className="mt-2 text-2xl font-semibold">{money(payoutDueCents)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{payoutDueOrders.length} completed orders</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Paid out</div>
          <div className="mt-2 text-2xl font-semibold">{paidOutOrders.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">manual seller payouts logged</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Gross sales</div>
          <div className="mt-2 text-2xl font-semibold">{money(grossSalesCents)}</div>
          <div className="mt-1 text-xs text-muted-foreground">non-cancelled purchases</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Guild fees</div>
          <div className="mt-2 text-2xl font-semibold">{money(platformFeeCents)}</div>
          <div className="mt-1 text-xs text-muted-foreground">estimated platform revenue</div>
        </div>
      </div>

      {tab === 'payouts' ? (
        <div className="space-y-3">
          {payoutDueOrders.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              No seller payouts due. Orders appear here after the buyer confirms receipt and the order becomes completed.
            </div>
          ) : null}
          {payoutDueOrders.map((o) => (
            <div key={o.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{o.order_ref}</span>
                    <span className={cn('rounded-full border px-2 py-0.5 text-xs', statusTone(o.status))}>
                      {o.status}
                    </span>
                  </div>
                  <h3 className="mt-1 font-semibold text-foreground">{o.listing_title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Seller: {o.seller_label} · Buyer: {o.buyer_label}
                  </p>
                  <p className="mt-2 text-sm">
                    Pay <span className="font-semibold text-accent">{o.payout_recipient_label}</span>{' '}
                    <span className="font-semibold">{money(o.seller_payout_cents)}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{o.payout_contact}</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button size="sm" variant="outline" onClick={() => copyPayout(o)}>
                    Copy payout info
                  </Button>
                  {o.thread_id ? (
                    <Button size="sm" variant="outline" onClick={() => setViewThreadId(o.thread_id)}>
                      Thread
                    </Button>
                  ) : null}
                  <Button size="sm" disabled={acting === o.id} onClick={() => markPaid(o)}>
                    Mark paid
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div>Created: {shortDate(o.created_at)}</div>
                <div>Shipped: {shortDate(o.shipped_at)}</div>
                <div>Delivered: {shortDate(o.delivered_at)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'orders' ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-2">Ref</th>
                <th className="p-2">Listing</th>
                <th className="p-2">Buyer</th>
                <th className="p-2">Seller</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Fee</th>
                <th className="p-2">Payout</th>
                <th className="p-2">Status</th>
                <th className="p-2">Shipping</th>
                <th className="p-2">Payout</th>
                <th className="p-2">Thread</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-sm text-muted-foreground">
                    No orders yet. This tab tracks purchases — use{' '}
                    <Link href="/market" className="text-accent hover:underline">
                      Browse marketplace
                    </Link>{' '}
                    to see listings and collections.
                  </td>
                </tr>
              ) : null}
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border/60">
                  <td className="p-2 font-mono text-xs">{o.order_ref}</td>
                  <td className="p-2">{o.listing_title}</td>
                  <td className="p-2">
                    <div>{o.buyer_label}</div>
                    <div className="text-xs text-muted-foreground">{o.buyer_contact}</div>
                  </td>
                  <td className="p-2">
                    <div>{o.seller_label}</div>
                    <div className="text-xs text-muted-foreground">{o.seller_contact}</div>
                  </td>
                  <td className="p-2">
                    <div>{money(o.amount_cents)}</div>
                    {o.shipping_cents ? (
                      <div className="text-xs text-muted-foreground">+ {money(o.shipping_cents)} shipping</div>
                    ) : null}
                  </td>
                  <td className="p-2">{money(o.platform_fee_cents)}</td>
                  <td className="p-2">
                    <div>{money(o.seller_payout_cents)}</div>
                    <div className="max-w-64 text-xs text-muted-foreground">{o.payout_recipient_label}</div>
                  </td>
                  <td className="p-2">
                    <span className={cn('rounded-full border px-2 py-0.5 text-xs', statusTone(o.status))}>
                      {o.status}
                    </span>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    <div>Ship: {shortDate(o.shipped_at)}</div>
                    <div>Done: {shortDate(o.delivered_at)}</div>
                    {o.tracking_number ? (
                      <div>{[o.shipping_carrier, o.tracking_number].filter(Boolean).join(' ')}</div>
                    ) : null}
                  </td>
                  <td className="p-2">
                    {o.seller_paid_at ? (
                      <div>
                        <span className="text-xs text-muted-foreground">Paid {shortDate(o.seller_paid_at)}</span>
                        {o.seller_payout_reference ? (
                          <div className="max-w-48 text-xs text-muted-foreground">{o.seller_payout_reference}</div>
                        ) : null}
                      </div>
                    ) : o.status === 'completed' ? (
                      <Button size="sm" disabled={acting === o.id} onClick={() => markPaid(o)}>
                        Mark payout paid
                      </Button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-2">
                    {o.thread_id ? (
                      <button
                        type="button"
                        className="text-xs text-accent hover:underline"
                        onClick={() => setViewThreadId(o.thread_id)}
                      >
                        View thread
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'trades' ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-2">ID</th>
                <th className="p-2">Initiator</th>
                <th className="p-2">Receiver</th>
                <th className="p-2">Boot</th>
                <th className="p-2">Status</th>
                <th className="p-2">Fees</th>
                <th className="p-2">Created</th>
                <th className="p-2">Actions</th>
                <th className="p-2">Thread</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-border/60">
                  <td className="p-2 font-mono text-xs">{t.id.slice(0, 8)}</td>
                  <td className="p-2">{t.initiator_listing}</td>
                  <td className="p-2">{t.receiver_listing}</td>
                  <td className="p-2">{money(t.boot_amount_cents)}</td>
                  <td className="p-2">{t.status}</td>
                  <td className="p-2">
                    {t.initiator_fee_paid ? 'I✓' : 'I✗'} / {t.receiver_fee_paid ? 'R✓' : 'R✗'}
                  </td>
                  <td className="p-2 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="p-2">
                    {t.status === 'receiver_accepted' || t.status === 'fees_pending' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting === t.id}
                        onClick={() => cancelTrade(t.id)}
                      >
                        Cancel + refund
                      </Button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-2">
                    {t.thread_id ? (
                      <button
                        type="button"
                        className="text-xs text-accent hover:underline"
                        onClick={() => setViewThreadId(t.thread_id)}
                      >
                        View thread
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'offers' ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-2">Listing</th>
                <th className="p-2">Buyer</th>
                <th className="p-2">Type</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Trade listing</th>
                <th className="p-2">Status</th>
                <th className="p-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} className="border-b border-border/60">
                  <td className="p-2">{o.listing_title}</td>
                  <td className="p-2">{o.buyer_label}</td>
                  <td className="p-2">{o.offer_type}</td>
                  <td className="p-2">
                    {o.amount_cents != null ? money(o.amount_cents) : '—'}
                  </td>
                  <td className="p-2">{o.trade_listing_title ?? '—'}</td>
                  <td className="p-2">{o.status}</td>
                  <td className="p-2 text-xs">{new Date(o.expires_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'ai' ? (
        <div className="space-y-4">
          <p className="text-sm">
            Estimated AI cost (30 days):{' '}
            <span className="font-semibold">${(aiTotalCents / 100).toFixed(2)}</span>
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-2">Date</th>
                  <th className="p-2">Route</th>
                  <th className="p-2">Calls</th>
                  <th className="p-2">Tokens</th>
                  <th className="p-2">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {aiCosts.map((row, i) => (
                  <tr key={`${row.day}-${row.route}-${i}`} className="border-b border-border/60">
                    <td className="p-2">{row.day}</td>
                    <td className="p-2">{row.route}</td>
                    <td className="p-2">{row.call_count}</td>
                    <td className="p-2">{row.total_tokens}</td>
                    <td className="p-2">${(row.cost_cents / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(viewThreadId)} onOpenChange={(open) => !open && setViewThreadId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thread (read-only)</DialogTitle>
          </DialogHeader>
          {viewThreadId ? (
            <MessageThread
              threadId={viewThreadId}
              currentUserId={adminUserId}
              readOnly
              maxHeight="360px"
              showSenderName
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Link href="/admin" className="text-sm text-accent hover:underline">
        ← Back to admin
      </Link>
    </div>
  );
}
