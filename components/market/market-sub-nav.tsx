'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'browse', href: '/market', label: 'Browse', match: (p: string) => p === '/market' },
  {
    id: 'collection',
    href: '/market/my-listings',
    label: 'My Collection',
    match: (p: string) => p.startsWith('/market/my-listings'),
  },
  { id: 'offers', href: '/market/offers', label: 'Offers', match: (p: string) => p.startsWith('/market/offers') },
  { id: 'orders', href: '/market/orders', label: 'Orders', match: (p: string) => p.startsWith('/market/orders') },
] as const;

function tabLabel(tab: (typeof TABS)[number], browseCount?: number, myCollectionCount?: number): string {
  if (tab.id === 'browse' && browseCount != null) {
    return `Browse (${browseCount})`;
  }
  if (tab.id === 'collection' && myCollectionCount != null) {
    return `My Collection (${myCollectionCount})`;
  }
  return tab.label;
}

export function MarketSubNav({
  pendingOffers = 0,
  messageUnread = 0,
  browseCount,
  myCollectionCount,
}: {
  pendingOffers?: number;
  messageUnread?: number;
  browseCount?: number;
  myCollectionCount?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto pb-0.5 border-b border-border">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tabLabel(tab, browseCount, myCollectionCount)}
            {tab.href === '/market/offers' && (pendingOffers > 0 || messageUnread > 0) ? (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-accent text-accent-foreground text-[10px] font-bold px-1">
                {pendingOffers + messageUnread > 99 ? '99+' : pendingOffers + messageUnread}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
