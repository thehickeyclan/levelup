'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackLink } from '@/components/back-link';

export default function MarketCheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get('listingId') || '';
  const [listing, setListing] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState({
    name: '',
    line1: '',
    city: '',
    state: '',
    zip: '',
  });

  useEffect(() => {
    if (!listingId) return;
    fetch(`/api/market/listings/${listingId}`)
      .then((r) => r.json())
      .then((d) => setListing(d.listing));
  }, [listingId]);

  const checkout = async () => {
    if (!listingId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/market/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, shipping_address: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      router.push('/market/orders');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  if (!listingId) {
    return (
      <div className="px-4 py-8">
        <p className="text-muted-foreground">Missing listing.</p>
        <Button asChild variant="link"><a href="/market">Back to Market</a></Button>
      </div>
    );
  }

  const price = (listing?.price_cents as number) ?? 0;
  const ship = (listing?.shipping_cents as number) ?? 0;

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref={`/market/listing/${listingId}`} label="Back" />
      <h1 className="text-2xl font-bold">Checkout</h1>
      <p className="text-sm text-muted-foreground">Session cart is unchanged — this is Guild Market only.</p>

      {listing ? (
        <div className="rounded-lg border border-zinc-800 p-4">
          <p className="font-medium">{listing.title as string}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Item ${(price / 100).toFixed(2)} + shipping ${(ship / 100).toFixed(2)} = ${((price + ship) / 100).toFixed(2)}
          </p>
          <p className="text-xs text-zinc-500 mt-2">Platform fee: $0.00 to you</p>
        </div>
      ) : null}

      <div className="space-y-3">
        <Label>Ship to</Label>
        <Input placeholder="Name" value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} />
        <Input placeholder="Address" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
          <Input placeholder="State" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} />
        </div>
        <Input placeholder="ZIP" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        className="w-full min-h-[48px] bg-accent text-black font-semibold"
        disabled={loading}
        onClick={checkout}
      >
        {loading ? 'Redirecting…' : 'Place market order'}
      </Button>
    </div>
  );
}
