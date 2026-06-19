'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatEST } from '@/lib/format-date';
import { MarketSubNav } from '@/components/market/market-sub-nav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type MarketOrderRow = {
  id: string;
  order_ref: string;
  status: string;
  amount_cents: number;
  shipping_cents: number;
  seller_payout_cents: number;
  created_at: string;
  listing_id: string;
  listing_title: string;
  listing_image_url: string | null;
  is_buyer: boolean;
  can_add_tracking: boolean;
  can_confirm_delivery: boolean;
};

function statusChip(status: string): { label: string; className: string } {
  switch (status) {
    case 'paid':
      return { label: 'Paid', className: 'text-amber-400 border-amber-500/40' };
    case 'shipped':
      return { label: 'Shipped', className: 'text-blue-400 border-blue-500/40' };
    case 'completed':
      return { label: 'Complete', className: 'text-emerald-400 border-emerald-500/40' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'text-muted-foreground border-border' };
    case 'disputed':
      return { label: 'Disputed', className: 'text-red-400 border-red-500/40' };
    default:
      return { label: status.replace(/_/g, ' '), className: 'text-muted-foreground border-border' };
  }
}

function OrderRow({ order, onRefresh }: { order: MarketOrderRow; onRefresh: () => void }) {
  const [tracking, setTracking] = useState('');
  const [acting, setActing] = useState(false);
  const chip = statusChip(order.status);
  const totalPaid = order.amount_cents + order.shipping_cents;

  const patch = async (payload: Record<string, unknown>) => {
    setActing(true);
    try {
      const res = await fetch(`/api/market/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="bg-card rounded-xl p-3 flex gap-3 border border-border">
      <Link href={`/market/orders/${order.id}`} className="flex gap-3 flex-1 min-w-0">
        <div className="w-12 h-12 rounded-lg bg-muted shrink-0 overflow-hidden">
          {order.listing_image_url ? (
            <img src={order.listing_image_url} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-muted-foreground">{order.order_ref}</p>
          <p className="text-sm font-medium text-foreground truncate">{order.listing_title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={cn('text-[10px] border rounded-full px-2 py-0.5', chip.className)}>
              {chip.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatEST(new Date(order.created_at), 'MMM d, yyyy')}
            </span>
          </div>
          <p className="text-sm text-accent mt-1">
            {order.is_buyer
              ? `$${(totalPaid / 100).toFixed(2)} paid`
              : `$${(order.seller_payout_cents / 100).toFixed(2)} payout`}
          </p>
        </div>
      </Link>
      <div className="shrink-0 flex flex-col gap-2">
        {order.can_add_tracking ? (
          <div className="flex gap-1">
            <Input
              className="h-8 w-24 text-xs"
              placeholder="Tracking"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
            <Button
              size="sm"
              className="h-8 text-xs bg-accent text-accent-foreground"
              disabled={acting || !tracking.trim()}
              onClick={() => patch({ tracking_number: tracking.trim(), status: 'shipped' })}
            >
              Ship
            </Button>
          </div>
        ) : null}
        {order.can_confirm_delivery ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={acting}
            onClick={() => patch({ status: 'completed' })}
          >
            Confirm delivery
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function MarketOrdersClient({
  orders,
  showSuccess,
  pendingOffers,
}: {
  orders: MarketOrderRow[];
  showSuccess: boolean;
  pendingOffers: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'buying' | 'selling'>('buying');

  const buying = orders.filter((o) => o.is_buyer);
  const selling = orders.filter((o) => !o.is_buyer);
  const visible = tab === 'buying' ? buying : selling;

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Orders</h1>
        <MarketSubNav pendingOffers={pendingOffers} />

        {showSuccess ? (
          <p className="text-sm text-accent bg-accent/10 border border-accent/30 rounded-lg p-3">
            Order placed — check your email for confirmation.
          </p>
        ) : null}

        <div className="flex gap-2">
          {(['buying', 'selling'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium',
                tab === t ? 'bg-accent text-accent-foreground' : 'border border-border text-muted-foreground'
              )}
            >
              {t === 'buying' ? 'Buying' : 'Selling'}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8">No orders in this tab yet.</p>
        ) : (
          <div className="space-y-2 pb-4">
            {visible.map((o) => (
              <OrderRow key={o.id} order={o} onRefresh={() => router.refresh()} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
