'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Search, Tag, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { activityNavHref } from '@/lib/activity-feed/activity-nav-href';

/** Athlete mobile nav — five core destinations (messages/notifications stay in header). */
const ITEMS: readonly {
  href: string;
  label: string;
  icon: typeof Users;
  match: (pathname: string) => boolean;
}[] = [
  {
    href: '/training',
    label: 'Training',
    icon: Users,
    match: (p) =>
      p === '/training' ||
      p.startsWith('/training/') ||
      p === '/youth-dashboard' ||
      p.startsWith('/youth-dashboard/'),
  },
  {
    href: activityNavHref('youth_wrestler'),
    label: 'Activity',
    icon: Activity,
    match: (p) => p.startsWith('/activity'),
  },
  {
    href: '/browse',
    label: 'Coaches',
    icon: Search,
    match: (p) => p === '/browse' || p.startsWith('/browse/'),
  },
  {
    href: '/market',
    label: 'Market',
    icon: Tag,
    match: (p) => p === '/market' || p.startsWith('/market/'),
  },
  {
    href: '/account',
    label: 'Account',
    icon: User,
    match: (p) => p === '/account' || p.startsWith('/account/'),
  },
];

export function YouthWrestlerBottomNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border/50 bg-black/95 backdrop-blur-xl supports-[backdrop-filter]:bg-black/90 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Athlete navigation"
    >
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const isActive = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center justify-center min-h-[56px] min-w-0 flex-1 py-2 px-2 touch-manipulation text-[10px] font-medium transition-all duration-200 whitespace-nowrap',
              isActive ? 'text-accent' : 'text-zinc-500 active:text-zinc-400'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              className={cn(
                'h-6 w-6 shrink-0 transition-transform duration-200',
                isActive && 'scale-110'
              )}
              strokeWidth={isActive ? 2.5 : 2}
              aria-hidden
            />
            <span
              className={cn(
                'mt-1 transition-all duration-200 leading-tight',
                isActive ? 'opacity-100' : 'opacity-70'
              )}
            >
              {label}
            </span>
            {isActive ? (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent rounded-full" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
