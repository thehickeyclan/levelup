'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, Gauge, Calendar, Star, Activity, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match: (section: string | null, sub: string | null, pathname: string) => boolean;
  badgeKey?: 'payouts';
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
    href: '/admin?section=money&sub=payouts',
    label: 'Payouts',
    icon: Wallet,
    match: (section, sub) => section === 'money' && sub === 'payouts',
    badgeKey: 'payouts',
  },
  {
    href: '/activity',
    label: 'Activity',
    icon: Activity,
    match: (_section, _sub, pathname) => pathname.startsWith('/activity'),
  },
  {
    href: '/admin?section=people&sub=coaches',
    label: 'Coaches',
    icon: Star,
    match: (section, sub) => section === 'people' && (sub === 'coaches' || sub === 'coach_week'),
  },
];

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#B89D60] text-[10px] font-bold text-black leading-4 text-center tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Admin mobile: primary destinations including Activity and Payouts queue badge. */
export function AdminBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = searchParams.get('section');
  const sub = searchParams.get('sub');
  const [pendingPayoutSessions, setPendingPayoutSessions] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/admin/payouts-pending-count', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ sessionCount?: number }>;
      })
      .then((data) => {
        if (!cancelled && data) {
          setPendingPayoutSessions(Math.max(0, Number(data.sessionCount ?? 0)));
        }
      })
      .catch(() => {
        /* ignore — badge is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, section, sub]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Admin navigation"
    >
      {ITEMS.map(({ href, label, icon: Icon, match, badgeKey }) => {
        const onAdminHome = pathname === '/admin' && !section && !sub;
        const isActive =
          pathname === '/admin' || pathname.startsWith('/admin/')
            ? match(section, sub, pathname) ||
              (label === 'Dashboard' && onAdminHome)
            : false;
        const badgeCount = badgeKey === 'payouts' ? pendingPayoutSessions : 0;

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center min-h-[52px] py-2 px-0.5 touch-manipulation text-[10px] font-medium transition-colors',
              isActive ? 'text-[#B89D60]' : 'text-muted-foreground'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="relative inline-flex mb-0.5">
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <NavBadge count={badgeCount} />
            </span>
            <span className="truncate max-w-full">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
