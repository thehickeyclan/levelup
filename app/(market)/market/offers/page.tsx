'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { formatEST } from '@/lib/format-date';

type OfferRow = {
  id: string;
  offer_type: string;
  amount_cents: number | null;
  message: string | null;
  status: string;
  created_at: string;
  listing_id: string;
  buyer_label?: string;
  market_listings?: {
    id: string;
    title: string;
    brand: string;
    model: string;
    market_listing_images?: { public_url: string; display_order: number }[];
  } | null;
};

export default function MarketOffersPage() {
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/market/offers?mode=incoming')
      .then((r) => r.json())
      .then((d) => setOffers(d.offers ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const respond = async (offerId: string, action: 'accept' | 'decline') => {
    setActing(offerId);
    try {
      const res = await fetch(`/api/market/offers/${offerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      load();
    } finally {
      setActing(null);
    }
  };

  const pending = offers.filter((o) => o.status === 'pending');
  const handled = offers.filter((o) => o.status !== 'pending');

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market" label="Back to Market" />
      <h1 className="text-2xl font-bold">Offers on your listings</h1>
      <p className="text-sm text-muted-foreground">
        Buyers reach out here for vault pairs and trade requests. You get an in-app alert when a new offer arrives.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : offers.length === 0 ? (
        <p className="text-muted-foreground">No offers yet.</p>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-accent">Pending ({pending.length})</h2>
              {pending.map((o) => (
                <OfferCard
                  key={o.id}
                  offer={o}
                  acting={acting === o.id}
                  onAccept={() => respond(o.id, 'accept')}
                  onDecline={() => respond(o.id, 'decline')}
                />
              ))}
            </section>
          ) : null}

          {handled.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Earlier</h2>
              {handled.map((o) => (
                <OfferCard key={o.id} offer={o} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function OfferCard({
  offer,
  acting,
  onAccept,
  onDecline,
}: {
  offer: OfferRow;
  acting?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const listing = offer.market_listings;
  const label = listing ? [listing.brand, listing.model].filter(Boolean).join(' ') : 'Listing';
  const img = listing?.market_listing_images
    ?.sort((a, b) => a.display_order - b.display_order)[0]?.public_url;

  return (
    <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
      <div className="flex gap-3">
        {img ? (
          <div className="w-14 h-14 rounded-md bg-[#1a1a1a] shrink-0 overflow-hidden">
            <img src={img} alt="" className="w-full h-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {offer.buyer_label ?? 'Buyer'} · {formatEST(new Date(offer.created_at), 'MMM d')}
          </p>
          {offer.offer_type === 'cash' && offer.amount_cents != null ? (
            <p className="text-lg font-bold text-accent mt-1">${(offer.amount_cents / 100).toFixed(0)}</p>
          ) : (
            <p className="text-sm text-accent mt-1">Trade offer</p>
          )}
        </div>
      </div>
      {offer.message ? (
        <p className="text-sm text-zinc-400 border-l-2 border-zinc-700 pl-3">{offer.message}</p>
      ) : null}
      {offer.status === 'pending' && onAccept && onDecline ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-accent text-black font-semibold"
            disabled={acting}
            onClick={onAccept}
          >
            Accept
          </Button>
          <Button size="sm" variant="outline" className="flex-1" disabled={acting} onClick={onDecline}>
            Decline
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground capitalize">{offer.status}</p>
      )}
      <Link href={`/market/listing/${offer.listing_id}`} className="text-xs text-accent hover:underline">
        View listing
      </Link>
    </div>
  );
}
