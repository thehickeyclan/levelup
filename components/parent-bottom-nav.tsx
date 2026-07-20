'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Home, Users, Tag, Menu } from 'lucide-react';
import { activityNavHref } from '@/lib/activity-feed/activity-nav-href';
import { cn } from '@/lib/utils';

/** Parent mobile bottom nav with gold active states. */
const ITEMS: readonly { href: string; label: string; icon: typeof Home }[] = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: activityNavHref('parent'), label: 'Activity', icon: Activity },
  { href: '/training', label: 'Training', icon: Users },
  { href: '/market', label: 'Market', icon: Tag },
  { href: '/more', label: 'More', icon: Menu },
];

const MORE_ROUTES = [
  '/more',
  '/cart',
  '/account',
  '/bookings',
  '/inbox',
  '/messages',
  '/notifications',
  '/my-wrestlers',
  '/my-coaches',
  '/wallet',
];

export function ParentBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border/50 bg-black/95 backdrop-blur-xl supports-[backdrop-filter]:bg-black/90 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main navigation"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive =
          href.startsWith('/activity')
            ? pathname.startsWith('/activity')
            : href === '/more'
              ? MORE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
            : pathname === href ||
              (href !== '/dashboard' && pathname.startsWith(href));
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
