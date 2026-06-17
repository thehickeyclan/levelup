'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/market', label: 'Browse', match: (p: string) => p === '/market' },
  { href: '/market/my-listings', label: 'My listings', match: (p: string) => p.startsWith('/market/my-listings') },
  { href: '/market/offers', label: 'Offers', match: (p: string) => p.startsWith('/market/offers') },
  { href: '/market/orders', label: 'Orders', match: (p: string) => p.startsWith('/market/orders') },
] as const;

export function MarketSubNav({ pendingOffers = 0 }: { pendingOffers?: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto pb-0.5 border-b border-[#1a1a1a]">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              active
                ? 'border-[#C9A265] text-[#C9A265]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            {tab.label}
            {tab.href === '/market/offers' && pendingOffers > 0 ? (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full bg-[#C9A265] text-black text-[10px] font-bold px-1">
                {pendingOffers}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
