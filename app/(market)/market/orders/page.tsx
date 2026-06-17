'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BackLink } from '@/components/back-link';

type Order = {
  id: string;
  order_ref: string;
  status: string;
  amount_cents: number;
  shipping_cents: number;
  created_at: string;
  listing_id: string;
  listing_title: string;
  is_buyer: boolean;
  can_review: boolean;
  review_rating: number | null;
};

export default function MarketOrdersPage() {
  const searchParams = useSearchParams();
  const success = searchParams.get('success');
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    fetch('/api/market/orders')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []));
  }, []);

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market" label="Back to Market" />
      <h1 className="text-2xl font-bold">Market orders</h1>

      {success ? (
        <p className="text-sm text-green-600 bg-green-500/10 border border-green-500/30 rounded-lg p-3">
          Payment received when Stripe confirms. Your session training cart was not changed.
        </p>
      ) : null}

      {orders.length === 0 ? (
        <p className="text-muted-foreground">No market orders yet.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-lg border border-zinc-800 p-4 space-y-2">
              <p className="font-mono text-sm">{o.order_ref}</p>
              <p className="text-sm font-medium">{o.listing_title}</p>
              <p className="text-sm text-muted-foreground">
                {o.status.replace(/_/g, ' ')} · ${((o.amount_cents + o.shipping_cents) / 100).toFixed(2)}
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <Link href={`/market/orders/${o.id}`} className="text-accent font-medium hover:underline">
                  Order details
                </Link>
                <Link href={`/market/listing/${o.listing_id}`} className="text-accent hover:underline">
                  View listing
                </Link>
                {o.is_buyer && o.can_review ? (
                  <Link href={`/market/orders/${o.id}/review`} className="text-accent font-medium hover:underline">
                    Rate seller
                  </Link>
                ) : null}
                {o.review_rating ? (
                  <span className="text-muted-foreground">You rated {o.review_rating}/5</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
