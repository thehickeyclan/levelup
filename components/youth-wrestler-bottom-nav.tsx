'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Tag, Search, Bell, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 5 items max. Same pattern as parent/coach: one bottom nav on mobile. */
const ITEMS = [
  { href: '/youth-dashboard', label: 'Home', icon: Home },
  { href: '/messages', label: 'Messages', icon: Mail },
  { href: '/small-group-sessions', label: 'Group', icon: Users },
  { href: '/market', label: 'Market', icon: Tag },
  { href: '/browse', label: 'Browse', icon: Search },
  { href: '/notifications', label: 'Notifications', icon: Bell },
] as const;

export function YouthWrestlerBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Athlete navigation"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href ||
          (href !== '/youth-dashboard' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center justify-center min-h-[44px] min-w-0 flex-1 py-2 px-2 touch-manipulation text-[11px] font-medium transition-colors whitespace-nowrap overflow-visible',
              isActive ? 'text-accent' : 'text-muted-foreground'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="h-5 w-5 shrink-0 mb-0.5" aria-hidden />
            <span className="overflow-visible whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
