'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Menu, ShoppingCart, Tag, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart } from '@/lib/cart-context';
import { activityNavHref } from '@/lib/activity-feed/activity-nav-href';

/** Parent mobile bottom nav with gold active states. */
const ITEMS: readonly { href: string; label: string; icon: typeof Users; showCartBadge?: boolean }[] = [
  { href: '/training', label: 'Training', icon: Users },
  { href: activityNavHref('parent'), label: 'Activity', icon: Activity },
  { href: '/market', label: 'Market', icon: Tag },
  { href: '/cart', label: 'Cart', icon: ShoppingCart, showCartBadge: true },
  { href: '/more', label: 'More', icon: Menu },
];

const MORE_ROUTES = [
  '/more',
  '/account',
  '/inbox',
  '/messages',
  '/notifications',
  '/my-wrestlers',
  '/my-coaches',
  '/wallet',
];

export function ParentBottomNav() {
  const pathname = usePathname();
  const { count: cartCount } = useCart();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border/50 bg-black/95 backdrop-blur-xl supports-[backdrop-filter]:bg-black/90 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main navigation"
    >
      {ITEMS.map(({ href, label, icon: Icon, showCartBadge }) => {
        const baseHref = href.split('?')[0];
        const isActive =
          href === '/training' && pathname === '/dashboard'
            ? true
            : href === '/more'
              ? MORE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
            : baseHref === '/activity'
              ? pathname.startsWith('/activity')
              : pathname === baseHref ||
                (baseHref !== '/dashboard' && pathname.startsWith(baseHref));
        return (
          <Link
            key={href}
            href={href}
            prefetch={true}
            onClick={(e) => {
              // Force navigation on mobile to prevent tap delays
              e.stopPropagation();
            }}
            className={cn(
              'relative flex flex-col items-center justify-center min-h-[56px] min-w-0 flex-1 py-2 px-2 touch-manipulation select-none text-[10px] font-medium transition-colors duration-100 whitespace-nowrap',
              '-webkit-tap-highlight-color: transparent',
              isActive 
                ? 'text-accent' 
                : 'text-zinc-500 active:text-zinc-400'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="relative">
              <Icon 
                className={cn(
                  "h-6 w-6 shrink-0 transition-transform duration-200",
                  isActive && "scale-110"
                )} 
                strokeWidth={isActive ? 2.5 : 2}
                aria-hidden 
              />
              {showCartBadge && cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-black ring-2 ring-black">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </div>
            <span className={cn(
              "mt-1 transition-all duration-200",
              isActive ? "opacity-100" : "opacity-70"
            )}>
              {label}
            </span>
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
