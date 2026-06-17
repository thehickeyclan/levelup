'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { Button } from '@/components/ui/button';

export default function MyListingsPage() {
  const [listings, setListings] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    fetch('/api/market/listings?seller=me&status=active')
      .then((r) => r.json())
      .then((d) => setListings(d.listings ?? []));
  }, []);

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <BackLink fallbackHref="/market" label="Back to Market" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My listings</h1>
        <Button asChild size="sm" className="bg-accent text-black">
          <Link href="/market/listing/new">New</Link>
        </Button>
      </div>

      {listings.length === 0 ? (
        <p className="text-muted-foreground">No active listings.</p>
      ) : (
        <ul className="space-y-3">
          {listings.map((l) => (
            <li key={l.id as string} className="rounded-lg border border-zinc-800 p-4">
              <Link href={`/market/listing/${l.id as string}`} className="font-medium hover:text-accent">
                {l.title as string}
              </Link>
              <p className="text-sm text-muted-foreground">{l.status as string}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
