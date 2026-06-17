'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SHIPPING_CARRIERS, type MarketShippingCarrier } from '@/lib/market/shipping';

type OrderDetail = {
  id: string;
  order_ref: string;
  status: string;
  status_label: string;
  amount_cents: number;
  shipping_cents: number;
  listing_id: string;
  listing_title: string;
  listing_image: string | null;
  role: 'buyer' | 'seller';
  shipping_carrier: MarketShippingCarrier;
  tracking_number: string | null;
  tracking_url: string | null;
  shipping_address_formatted: string | null;
  label_image_url: string | null;
  can_add_tracking: boolean;
  can_mark_received: boolean;
  can_review: boolean;
  shipped_at: string | null;
};

type LabelScan = {
  tracking_number: string;
  carrier: MarketShippingCarrier;
  confidence: string;
  note: string | null;
};

export default function MarketOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [carrier, setCarrier] = useState<MarketShippingCarrier>('usps');
  const [tracking, setTracking] = useState('');
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/market/orders/${orderId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.order) {
          setOrder(d.order);
          if (d.order.tracking_number) setTracking(d.order.tracking_number);
          if (d.order.shipping_carrier) setCarrier(d.order.shipping_carrier);
        }
      });
  };

  useEffect(() => {
    load();
  }, [orderId]);

  const onLabelPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setError(null);
    setScanNote(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/market/orders/${orderId}/shipping/scan`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (data.scan) {
        const s = data.scan as LabelScan;
        setTracking(s.tracking_number);
        setCarrier(s.carrier);
        setScanNote(
          s.note ||
            `Detected (${s.confidence} confidence) — confirm before notifying buyer.`
        );
      } else {
        setError(data.error || 'Could not read label');
      }
      load();
    } catch {
      setError('Upload failed');
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  const confirmShip = async () => {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/orders/${orderId}/shipping/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: tracking, carrier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setConfirming(false);
    }
  };

  const markReceived = async () => {
    setReceiving(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'received' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setOrder(data.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setReceiving(false);
    }
  };

  if (!order) {
    return (
      <div className="px-4 py-8">
        <BackLink fallbackHref="/market/orders" label="Back" />
        <p className="mt-4 text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market/orders" label="Back to orders" />

      <div>
        <p className="font-mono text-sm text-muted-foreground">{order.order_ref}</p>
        <h1 className="text-2xl font-bold mt-1">{order.listing_title}</h1>
        <p className="text-sm text-accent font-medium mt-1">{order.status_label}</p>
      </div>

      {order.listing_image ? (
        <div className="rounded-lg bg-white aspect-square max-w-[200px] overflow-hidden">
          <img src={order.listing_image} alt="" className="w-full h-full object-contain p-2" />
        </div>
      ) : null}

      <p className="text-sm">
        ${((order.amount_cents + order.shipping_cents) / 100).toFixed(2)} total
      </p>

      {order.role === 'seller' && order.shipping_address_formatted ? (
        <div className="rounded-lg border border-zinc-800 p-4 space-y-2">
          <p className="text-sm font-medium">Ship to</p>
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {order.shipping_address_formatted}
          </p>
        </div>
      ) : null}

      {order.tracking_number ? (
        <div className="rounded-lg border border-zinc-800 p-4 space-y-2">
          <p className="text-sm font-medium">Tracking</p>
          <p className="text-sm font-mono">{order.tracking_number}</p>
          {order.tracking_url ? (
            <a
              href={order.tracking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent underline"
            >
              Track package
            </a>
          ) : null}
        </div>
      ) : null}

      {order.can_add_tracking ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 space-y-4">
          <div>
            <p className="text-sm font-medium">Add shipping</p>
            <p className="text-xs text-muted-foreground mt-1">
              Photo your label or receipt — we&apos;ll read the tracking number. Confirm before the buyer is notified.
            </p>
          </div>

          <div>
            <Label>Label photo</Label>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onLabelPhoto}
              disabled={scanning}
              className="mt-1"
            />
            {scanning ? <p className="text-xs text-muted-foreground mt-1">Reading label…</p> : null}
          </div>

          <div>
            <Label>Carrier</Label>
            <select
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value as MarketShippingCarrier)}
            >
              {SHIPPING_CARRIERS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Tracking number</Label>
            <Input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="From label — edit if needed"
              className="mt-1 font-mono text-sm"
            />
          </div>

          {scanNote ? <p className="text-xs text-muted-foreground">{scanNote}</p> : null}

          <Button
            className="w-full bg-accent text-black font-semibold"
            onClick={confirmShip}
            disabled={confirming || !tracking.trim()}
          >
            {confirming ? 'Saving…' : 'Confirm & notify buyer'}
          </Button>
        </div>
      ) : null}

      {order.can_mark_received ? (
        <Button
          className="w-full bg-accent text-black font-semibold"
          onClick={markReceived}
          disabled={receiving}
        >
          {receiving ? 'Saving…' : 'I received my shoes'}
        </Button>
      ) : null}

      {order.can_review ? (
        <Button asChild variant="outline" className="w-full">
          <Link href={`/market/orders/${orderId}/review`}>Rate seller</Link>
        </Button>
      ) : null}

      <Link href={`/market/listing/${order.listing_id}`} className="text-sm text-accent hover:underline block">
        View listing
      </Link>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
