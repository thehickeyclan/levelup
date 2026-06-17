'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { MarketSubNav } from '@/components/market/market-sub-nav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MyListingRow } from '@/lib/market/my-listings-data';

function statusBadge(listing: MyListingRow): { label: string; className: string } {
  if (listing.listing_type === 'vault' && listing.status === 'active') {
    return { label: 'Vault', className: 'text-[#C9A265] border-[#C9A265]/40' };
  }
  switch (listing.status) {
    case 'active':
      return { label: 'Active', className: 'text-emerald-400 border-emerald-500/40' };
    case 'sold':
    case 'traded':
      return { label: listing.status === 'sold' ? 'Sold' : 'Traded', className: 'text-zinc-500 border-zinc-600' };
    case 'draft':
      return { label: 'Draft', className: 'text-amber-400 border-amber-500/40' };
    default:
      return { label: listing.status, className: 'text-zinc-500 border-zinc-600' };
  }
}

function priceLabel(listing: MyListingRow): string {
  if (listing.listing_type === 'vault') return 'Vault';
  if (listing.listing_type === 'trade') return 'Trade';
  if (listing.price_cents != null) return `$${(listing.price_cents / 100).toFixed(0)}`;
  return 'Make offer';
}

function ListingRow({ listing }: { listing: MyListingRow }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const badge = statusBadge(listing);
  const title = listing.model?.trim() || listing.title;

  const runAction = async (action: 'archive' | 'delete') => {
    setActing(true);
    try {
      const res = await fetch(`/api/market/listings/${listing.id}`, {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'archive' ? JSON.stringify({ status: 'archived' }) : undefined,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
      setMenuOpen(false);
    }
  };

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-3 flex gap-3 items-center relative">
      <Link href={`/market/listing/${listing.id}`} className="flex gap-3 items-center flex-1 min-w-0">
        <div className="w-12 h-12 rounded-lg bg-black shrink-0 overflow-hidden">
          {listing.primary_image_url ? (
            <img src={listing.primary_image_url} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{title}</p>
          <p className="text-xs text-zinc-500 truncate">
            {listing.brand} · Size {listing.size} · {listing.condition_label}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={cn('text-[10px] border rounded-full px-2 py-0.5', badge.className)}>
              {badge.label}
            </span>
            <span className="text-xs text-[#C9A265]">{priceLabel(listing)}</span>
          </div>
        </div>
      </Link>

      {listing.pending_offer_count > 0 ? (
        <Link
          href={`/market/offers?listing=${listing.id}`}
          className="shrink-0 text-[10px] font-semibold bg-[#C9A265] text-black rounded-full px-2 py-1"
        >
          {listing.pending_offer_count} offer{listing.pending_offer_count !== 1 ? 's' : ''}
        </Link>
      ) : null}

      {(listing.can_archive || listing.can_delete) ? (
        <div className="relative shrink-0">
          <button
            type="button"
            className="p-1 text-zinc-500 hover:text-white"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Listing actions"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-8 z-10 min-w-[120px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
              <Link
                href={`/market/listing/${listing.id}`}
                className="block px-3 py-2 text-xs hover:bg-zinc-800"
                onClick={() => setMenuOpen(false)}
              >
                Edit
              </Link>
              {listing.can_archive ? (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800"
                  disabled={acting}
                  onClick={() => runAction('archive')}
                >
                  Archive
                </button>
              ) : null}
              {listing.can_delete ? (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-zinc-800"
                  disabled={acting}
                  onClick={() => runAction('delete')}
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, listings }: { title: string; listings: MyListingRow[] }) {
  if (!listings.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-zinc-400">{title}</h2>
      <div className="space-y-2">
        {listings.map((l) => (
          <ListingRow key={l.id} listing={l} />
        ))}
      </div>
    </section>
  );
}

export function MyListingsClient({
  groups,
  pendingOffers,
}: {
  groups: { active: MyListingRow[]; soldTraded: MyListingRow[]; drafts: MyListingRow[] };
  pendingOffers: number;
}) {
  const total = groups.active.length + groups.soldTraded.length + groups.drafts.length;

  return (
    <div className="min-h-screen pb-24 bg-black">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">My listings</h1>
          <Button asChild size="sm" className="bg-[#C9A265] text-black rounded-full">
            <Link href="/market/listing/new">List a pair</Link>
          </Button>
        </div>
        <MarketSubNav pendingOffers={pendingOffers} />
        {total === 0 ? (
          <p className="text-sm text-zinc-500 py-8 text-center">No listings yet.</p>
        ) : (
          <div className="space-y-6 pb-4">
            <Section title="Active" listings={groups.active} />
            <Section title="Sold / traded" listings={groups.soldTraded} />
            <Section title="Drafts" listings={groups.drafts} />
          </div>
        )}
      </div>
    </div>
  );
}
