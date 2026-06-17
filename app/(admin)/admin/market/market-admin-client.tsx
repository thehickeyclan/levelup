'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AdminMarketOrder = {
  id: string;
  order_ref: string;
  listing_title: string;
  buyer_label: string;
  seller_label: string;
  amount_cents: number;
  platform_fee_cents: number;
  seller_payout_cents: number;
  status: string;
  created_at: string;
  seller_paid_at: string | null;
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

export function MarketAdminClient({
  orders,
  trades,
  offers,
  aiCosts,
  aiTotalCents,
}: {
  orders: AdminMarketOrder[];
  trades: AdminMarketTrade[];
  offers: AdminMarketOffer[];
  aiCosts: AdminAiCostRow[];
  aiTotalCents: number;
}) {
  const [tab, setTab] = useState<'orders' | 'trades' | 'offers' | 'ai'>('orders');
  const [acting, setActing] = useState<string | null>(null);

  const markPaid = async (orderId: string) => {
    setActing(orderId);
    try {
      const res = await fetch(`/api/admin/market/${orderId}/payout`, { method: 'POST' });
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

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {(['orders', 'trades', 'offers', 'ai'] as const).map((t) => (
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
                <th className="p-2">Payout</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border/60">
                  <td className="p-2 font-mono text-xs">{o.order_ref}</td>
                  <td className="p-2">{o.listing_title}</td>
                  <td className="p-2">{o.buyer_label}</td>
                  <td className="p-2">{o.seller_label}</td>
                  <td className="p-2">${(o.amount_cents / 100).toFixed(2)}</td>
                  <td className="p-2">${(o.platform_fee_cents / 100).toFixed(2)}</td>
                  <td className="p-2">${(o.seller_payout_cents / 100).toFixed(2)}</td>
                  <td className="p-2">{o.status}</td>
                  <td className="p-2">
                    {o.seller_paid_at ? (
                      <span className="text-xs text-muted-foreground">Paid</span>
                    ) : o.status === 'completed' ? (
                      <Button size="sm" disabled={acting === o.id} onClick={() => markPaid(o.id)}>
                        Mark payout paid
                      </Button>
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
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-border/60">
                  <td className="p-2 font-mono text-xs">{t.id.slice(0, 8)}</td>
                  <td className="p-2">{t.initiator_listing}</td>
                  <td className="p-2">{t.receiver_listing}</td>
                  <td className="p-2">${(t.boot_amount_cents / 100).toFixed(0)}</td>
                  <td className="p-2">{t.status}</td>
                  <td className="p-2">
                    {t.initiator_fee_paid ? 'I✓' : 'I✗'} / {t.receiver_fee_paid ? 'R✓' : 'R✗'}
                  </td>
                  <td className="p-2 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
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
                    {o.amount_cents != null ? `$${(o.amount_cents / 100).toFixed(0)}` : '—'}
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

      <Link href="/admin" className="text-sm text-accent hover:underline">
        ← Back to admin
      </Link>
    </div>
  );
}
