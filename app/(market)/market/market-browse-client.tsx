'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';
import { MarketListingCard, type MarketListingCardData } from '@/components/market/listing-card';

export function MarketBrowseClient() {
  const [listings, setListings] = useState<MarketListingCardData[]>([]);
  const [pendingOffers, setPendingOffers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/market/listings').then((r) => r.json()),
      fetch('/api/market/offers?mode=incoming').then((r) => r.json()),
    ])
      .then(([listingsRes, offersRes]) => {
        setListings(listingsRes.listings ?? []);
        setPendingOffers(offersRes.pending_count ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 pt-6 pb-4 max-w-5xl mx-auto flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Guild Market</h1>
          <p className="text-sm text-muted-foreground">Wrestling sneakers · buy, sell, trade</p>
        </div>
        <Button asChild className="bg-accent text-black font-semibold shrink-0">
          <Link href="/market/listing/new">List a pair</Link>
        </Button>
      </div>

      <div className="px-4 mb-4 max-w-5xl mx-auto flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/market/my-listings">My listings</Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="relative">
          <Link href="/market/offers">
            Offers
            {pendingOffers > 0 ? (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-accent text-black text-[10px] font-bold px-1">
                {pendingOffers}
              </span>
            ) : null}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/market/orders">Orders</Link>
        </Button>
      </div>

      {loading ? (
        <p className="px-4 max-w-5xl mx-auto text-muted-foreground">Loading…</p>
      ) : listings.length === 0 ? (
        <div className="px-4 max-w-5xl mx-auto py-12 text-center text-muted-foreground">
          <p>No listings yet. Be the first to list a pair.</p>
        </div>
      ) : (
        <div className="px-4 max-w-5xl mx-auto grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((l) => (
            <MarketListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}
