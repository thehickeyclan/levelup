'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { MarketSubNav } from '@/components/market/market-sub-nav';
import {
  ListingTypeQuickActions,
  type ListingTypePatch,
} from '@/components/market/listing-type-quick-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MyListingRow } from '@/lib/market/my-listings-data';
import type { MarketListingType } from '@/lib/market/listing-type-options';

function statusBadge(listing: MyListingRow): { label: string; className: string } {
  if (listing.listing_type === 'collection' && listing.status === 'active') {
    return { label: 'Collection', className: 'text-muted-foreground border-border' };
  }
  if (listing.listing_type === 'vault' && listing.status === 'active') {
    return { label: 'Offers', className: 'text-accent border-accent/40' };
  }
  switch (listing.status) {
    case 'active':
      return { label: 'Active', className: 'text-emerald-400 border-emerald-500/40' };
    case 'sold':
    case 'traded':
      return { label: listing.status === 'sold' ? 'Sold' : 'Traded', className: 'text-muted-foreground border-border' };
    case 'draft':
      return { label: 'Draft', className: 'text-amber-400 border-amber-500/40' };
    default:
      return { label: listing.status, className: 'text-muted-foreground border-border' };
  }
}

function priceLabel(listing: MyListingRow): string {
  if (listing.listing_type === 'collection') return 'Not for sale';
  if (listing.listing_type === 'vault') return 'Offers only';
  if (listing.listing_type === 'trade') return 'Trade only';
  if (listing.price_cents != null) return `$${(listing.price_cents / 100).toFixed(0)}`;
  return 'Make offer';
}

function showQuickListActions(listing: MyListingRow): boolean {
  return (
    listing.status === 'active' &&
    (listing.listing_type === 'collection' ||
      listing.listing_type === 'vault' ||
      listing.listing_type === 'trade')
  );
}

function ListingRow({
  listing,
  onDeleted,
  onListingUpdated,
}: {
  listing: MyListingRow;
  onDeleted: (id: string) => void;
  onListingUpdated: (id: string, patch: ListingTypePatch) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const badge = statusBadge(listing);
  const title = listing.model?.trim() || listing.title;
  const quickActions = showQuickListActions(listing);

  const runAction = async (action: 'archive' | 'delete') => {
    setActing(true);
    try {
      const res = await fetch(`/api/market/listings/${listing.id}`, {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'delete' ? undefined : JSON.stringify({ status: 'archived' }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      onDeleted(listing.id);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
      setMenuOpen(false);
    }
  };

  return (
    <div className="bg-card rounded-xl p-3 space-y-0">
      <div className="flex gap-3 items-center relative">
        <Link href={`/market/listing/${listing.id}`} className="flex gap-3 items-center flex-1 min-w-0">
          <div className="w-12 h-12 rounded-lg bg-muted shrink-0 overflow-hidden">
            {listing.primary_image_url ? (
              <img src={listing.primary_image_url} alt="" className="w-full h-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {listing.brand} · Size {listing.size} · {listing.condition_label}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={cn('text-[10px] border rounded-full px-2 py-0.5', badge.className)}>
                {badge.label}
              </span>
              <span className="text-xs text-accent">{priceLabel(listing)}</span>
            </div>
          </div>
        </Link>

        {listing.pending_offer_count > 0 ? (
          <Link
            href={`/market/offers?listing=${listing.id}`}
            className="shrink-0 text-[10px] font-semibold bg-accent text-accent-foreground rounded-full px-2 py-1"
          >
            {listing.pending_offer_count} offer{listing.pending_offer_count !== 1 ? 's' : ''}
          </Link>
        ) : null}

        {(listing.can_archive || listing.can_delete || quickActions) ? (
          <div className="relative shrink-0">
            <button
              type="button"
              className="p-1 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              aria-label="Listing actions"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-8 z-10 min-w-[120px] rounded-lg border border-border bg-card py-1 shadow-lg">
                <Link
                  href={`/market/listing/${listing.id}/edit`}
                  className="block px-3 py-2 text-xs hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  Edit
                </Link>
                {listing.can_archive ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted"
                    disabled={acting}
                    onClick={() => runAction('archive')}
                  >
                    Archive
                  </button>
                ) : null}
                {listing.can_delete ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-muted"
                    disabled={acting}
                    onClick={(e) => {
                      e.stopPropagation();
                      void runAction('delete');
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {quickActions ? (
        <ListingTypeQuickActions
          listingId={listing.id}
          currentType={listing.listing_type as MarketListingType}
          currentPriceCents={listing.price_cents}
          compact
          onUpdated={(patch) => onListingUpdated(listing.id, patch)}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  listings,
  onDeleted,
  onListingUpdated,
}: {
  title: string;
  listings: MyListingRow[];
  onDeleted: (id: string) => void;
  onListingUpdated: (id: string, patch: ListingTypePatch) => void;
}) {
  if (!listings.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="space-y-2">
        {listings.map((l) => (
          <ListingRow
            key={l.id}
            listing={l}
            onDeleted={onDeleted}
            onListingUpdated={onListingUpdated}
          />
        ))}
      </div>
    </section>
  );
}

export function MyListingsClient({
  groups: initialGroups,
  pendingOffers,
}: {
  groups: {
    active: MyListingRow[];
    collection: MyListingRow[];
    soldTraded: MyListingRow[];
    drafts: MyListingRow[];
  };
  pendingOffers: number;
}) {
  const [groups, setGroups] = useState(initialGroups);

  const removeListing = (id: string) => {
    setGroups((g) => ({
      active: g.active.filter((l) => l.id !== id),
      collection: g.collection.filter((l) => l.id !== id),
      soldTraded: g.soldTraded.filter((l) => l.id !== id),
      drafts: g.drafts.filter((l) => l.id !== id),
    }));
  };

  const relocateListing = (id: string, patch: ListingTypePatch) => {
    setGroups((g) => {
      const all = [...g.active, ...g.collection, ...g.drafts];
      const item = all.find((l) => l.id === id);
      if (!item) return g;

      const updated: MyListingRow = {
        ...item,
        listing_type: patch.listing_type,
        price_cents: patch.price_cents,
      };

      const strip = (arr: MyListingRow[]) => arr.filter((l) => l.id !== id);
      let active = strip(g.active);
      let collection = strip(g.collection);

      if (patch.listing_type === 'collection') {
        collection = [updated, ...collection];
      } else {
        active = [updated, ...active];
      }

      return {
        ...g,
        active,
        collection,
        soldTraded: strip(g.soldTraded),
        drafts: strip(g.drafts),
      };
    });
  };

  const total =
    groups.active.length +
    groups.collection.length +
    groups.soldTraded.length +
    groups.drafts.length;

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">My listings</h1>
          <Button asChild size="sm" className="bg-accent text-accent-foreground rounded-full">
            <Link href="/market/listing/new">List a pair</Link>
          </Button>
        </div>
        <MarketSubNav pendingOffers={pendingOffers} />
        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No listings yet.</p>
        ) : (
          <div className="space-y-6 pb-4">
            <Section
              title="Active"
              listings={groups.active}
              onDeleted={removeListing}
              onListingUpdated={relocateListing}
            />
            <Section
              title="Collection"
              listings={groups.collection}
              onDeleted={removeListing}
              onListingUpdated={relocateListing}
            />
            <Section
              title="Sold / traded"
              listings={groups.soldTraded}
              onDeleted={removeListing}
              onListingUpdated={relocateListing}
            />
            <Section
              title="Drafts"
              listings={groups.drafts}
              onDeleted={removeListing}
              onListingUpdated={relocateListing}
            />
          </div>
        )}
      </div>
    </div>
  );
}
