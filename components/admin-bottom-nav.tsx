'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, Gauge, Calendar, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match: (section: string | null, sub: string | null, pathname: string) => boolean;
};

const ITEMS: NavItem[] = [
  {
    href: '/admin?section=overview&sub=dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    match: (section, sub) => section === 'overview' && sub !== 'cockpit',
  },
  {
    href: '/admin?section=overview&sub=cockpit',
    label: 'Cockpit',
    icon: Gauge,
    match: (section, sub) => section === 'overview' && sub === 'cockpit',
  },
  {
    href: '/admin?section=bookings&sub=sessions',
    label: 'Sessions',
    icon: Calendar,
    match: (section) => section === 'bookings',
  },
  {
    href: '/admin?section=people&sub=coaches',
    label: 'Coaches',
    icon: Star,
    match: (section, sub) => section === 'people' && (sub === 'coaches' || sub === 'coach_week'),
  },
];

/** Admin mobile: four primary destinations only. */
export function AdminBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = searchParams.get('section');
  const sub = searchParams.get('sub');

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Admin navigation"
    >
      {ITEMS.map(({ href, label, icon: Icon, match }) => {
        const onAdminHome = pathname === '/admin' && !section && !sub;
        const isActive =
          pathname === '/admin' || pathname.startsWith('/admin/')
            ? match(section, sub, pathname) ||
              (label === 'Dashboard' && onAdminHome)
            : false;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center min-h-[52px] py-2 px-1 touch-manipulation text-[11px] font-medium transition-colors',
              isActive ? 'text-[#B89D60]' : 'text-muted-foreground'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="h-5 w-5 shrink-0 mb-0.5" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
