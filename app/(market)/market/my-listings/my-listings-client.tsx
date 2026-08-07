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
import { formatMarketShoeSize } from '@/lib/market/listing-sizes';
import type { MyListingRow } from '@/lib/market/my-listings-data';
import { sellerListingStatusBadge } from '@/lib/market/listing-type-options';
import type { MarketListingType } from '@/lib/market/listing-type-options';
import { cn } from '@/lib/utils';

function priceLabel(listing: MyListingRow): string {
  if (listing.listing_type === 'collection' || listing.listing_type === 'vault') {
    return 'In collection';
  }
  if (listing.listing_type === 'trade') return 'Trade only';
  if (listing.price_cents != null) return `$${(listing.price_cents / 100).toFixed(0)}`;
  return 'Make offer';
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
  const badge = sellerListingStatusBadge(listing.listing_type, listing.status);
  const title = listing.model?.trim() || listing.title;
  const showQuickActions = listing.status === 'active';

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
              {listing.brand} · {formatMarketShoeSize(listing.size)} · {listing.condition_label}
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

        {(listing.can_archive || listing.can_delete || showQuickActions) ? (
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

      {showQuickActions ? (
        <ListingTypeQuickActions
          listingId={listing.id}
          currentType={listing.listing_type as MarketListingType}
          currentPriceCents={listing.price_cents}
          compact
          modeBlockedReason={listing.can_change_mode ? null : listing.mode_blocked_reason}
          activeTradeId={listing.active_trade_id}
          onUpdated={(patch) => onListingUpdated(listing.id, patch)}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  description,
  listings,
  onDeleted,
  onListingUpdated,
}: {
  title: string;
  description?: string;
  listings: MyListingRow[];
  onDeleted: (id: string) => void;
  onListingUpdated: (id: string, patch: ListingTypePatch) => void;
}) {
  if (!listings.length) return null;
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
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
  browsePairCount = 0,
}: {
  groups: {
    pairs: MyListingRow[];
    soldTraded: MyListingRow[];
    drafts: MyListingRow[];
    archived: MyListingRow[];
  };
  pendingOffers: number;
  browsePairCount?: number;
}) {
  const [groups, setGroups] = useState(initialGroups);

  const removeListing = (id: string) => {
    setGroups((g) => ({
      pairs: g.pairs.filter((l) => l.id !== id),
      soldTraded: g.soldTraded.filter((l) => l.id !== id),
      drafts: g.drafts.filter((l) => l.id !== id),
      archived: g.archived.filter((l) => l.id !== id),
    }));
  };

  const updateListing = (id: string, patch: ListingTypePatch) => {
    setGroups((g) => ({
      ...g,
      pairs: g.pairs.map((l) =>
        l.id === id
          ? {
              ...l,
              listing_type: patch.listing_type,
              price_cents: patch.price_cents,
              can_change_mode: true,
              mode_blocked_reason: null,
              active_trade_id: null,
            }
          : l
      ),
    }));
  };

  const total =
    groups.pairs.length +
    groups.soldTraded.length +
    groups.drafts.length +
    groups.archived.length;

  const activeCount = groups.pairs.length;
  const statsForSale = groups.pairs.filter((l) => l.listing_type === 'sell').length;
  const statsTrade = groups.pairs.filter((l) => l.listing_type === 'trade').length;
  const statsInCollection = groups.pairs.filter(
    (l) => l.listing_type === 'collection' || l.listing_type === 'vault'
  ).length;

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">My Market</p>
            <h1 className="text-2xl font-bold text-foreground mt-1">My Market</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {activeCount} active pair{activeCount !== 1 ? 's' : ''} · {statsForSale} for sale ·{' '}
              {statsTrade} trading · {statsInCollection} in Guild Collections
            </p>
          </div>
          <Button asChild size="sm" className="bg-accent text-accent-foreground rounded-full shrink-0">
            <Link href="/market/listing/new?type=collection">+ Add pair</Link>
          </Button>
        </div>
        <MarketSubNav
          pendingOffers={pendingOffers}
          browseCount={browsePairCount}
          myCollectionCount={activeCount}
        />
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/market/listing/new?type=collection"
            className="rounded-xl border border-border bg-card p-3 text-center"
          >
            <span className="block text-xs font-semibold text-foreground">Collect</span>
            <span className="block text-[10px] text-muted-foreground mt-1">Showcase only</span>
          </Link>
          <Link
            href="/market/listing/new?type=sell"
            className="rounded-xl border border-border bg-card p-3 text-center"
          >
            <span className="block text-xs font-semibold text-foreground">Sell</span>
            <span className="block text-[10px] text-muted-foreground mt-1">Price + offers</span>
          </Link>
          <Link
            href="/market/listing/new?type=trade"
            className="rounded-xl border border-border bg-card p-3 text-center"
          >
            <span className="block text-xs font-semibold text-foreground">Trade</span>
            <span className="block text-[10px] text-muted-foreground mt-1">Swap or cash</span>
          </Link>
        </div>
        {total === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm font-medium text-foreground">Your Market is empty.</p>
            <p className="text-sm text-muted-foreground">Add a pair to showcase, sell, or trade.</p>
            <Button asChild className="bg-accent text-accent-foreground rounded-full">
              <Link href="/market/listing/new?type=collection">+ Add pair</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-6 pb-4">
            <Section
              title="In your collection"
              description={`${groups.pairs.length} pair${groups.pairs.length !== 1 ? 's' : ''}`}
              listings={groups.pairs}
              onDeleted={removeListing}
              onListingUpdated={updateListing}
            />
            <Section
              title="Sold & traded"
              listings={groups.soldTraded}
              onDeleted={removeListing}
              onListingUpdated={updateListing}
            />
            <Section
              title="Drafts"
              listings={groups.drafts}
              onDeleted={removeListing}
              onListingUpdated={updateListing}
            />
            <Section
              title="Archived"
              listings={groups.archived}
              onDeleted={removeListing}
              onListingUpdated={updateListing}
            />
          </div>
        )}
      </div>
    </div>
  );
}
