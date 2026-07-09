'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, CirclePlus, Tag, DollarSign, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCoachPendingRequestsCount } from '@/lib/hooks/use-coach-pending-requests-count';

const ITEMS: readonly {
  href: string;
  label: string;
  icon: typeof Calendar;
  match: (pathname: string) => boolean;
}[] = [
  {
    href: '/athlete-dashboard',
    label: 'Schedule',
    icon: Calendar,
    match: (p) => p === '/athlete-dashboard' || p.startsWith('/athlete-dashboard/'),
  },
  {
    href: '/coach-sessions/create',
    label: 'Create',
    icon: CirclePlus,
    match: (p) => p === '/coach-sessions/create' || p.startsWith('/coach-sessions/create/'),
  },
  {
    href: '/market',
    label: 'Market',
    icon: Tag,
    match: (p) => p === '/market' || p.startsWith('/market/'),
  },
  {
    href: '/coach-earnings',
    label: 'Earnings',
    icon: DollarSign,
    match: (p) =>
      p === '/coach-earnings' ||
      p.startsWith('/coach-earnings/') ||
      p === '/coach-dashboard' ||
      p.startsWith('/coach-dashboard/'),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: User,
    match: (p) => p === '/profile' || p.startsWith('/profile/'),
  },
];

export function CoachBottomNav() {
  const pathname = usePathname() ?? '';
  const [pendingCount] = useCoachPendingRequestsCount(true);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border/50 bg-black/95 backdrop-blur-xl supports-[backdrop-filter]:bg-black/90 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Coach navigation"
    >
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const isActive = match(pathname);
        const showBadge = href === '/athlete-dashboard' && pendingCount > 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center justify-center min-h-[56px] min-w-0 flex-1 py-2 px-2 touch-manipulation text-[11px] font-medium transition-all duration-200 whitespace-nowrap',
              isActive ? 'text-accent' : 'text-zinc-500 active:text-zinc-400'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <div className="relative">
              <Icon
                className={cn(
                  'h-6 w-6 shrink-0 transition-transform duration-200',
                  isActive && 'scale-110'
                )}
                strokeWidth={isActive ? 2.5 : 2}
                aria-hidden
              />
              {showBadge && (
                <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-accent text-black rounded-full">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </div>
            <span
              className={cn(
                'mt-1 transition-all duration-200 leading-tight text-[10px]',
                isActive ? 'opacity-100' : 'opacity-70'
              )}
            >
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
