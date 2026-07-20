import Link from 'next/link';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  HeartHandshake,
  MessageSquare,
  ShoppingCart,
  UserRound,
  UsersRound,
} from 'lucide-react';

const LINKS = [
  { href: '/bookings', label: 'My training', detail: 'Upcoming and past sessions', icon: CalendarDays },
  { href: '/inbox', label: 'Inbox', detail: 'Coaches, sessions, and Market', icon: MessageSquare },
  { href: '/cart', label: 'Cart', detail: 'Review sessions before checkout', icon: ShoppingCart },
  { href: '/notifications', label: 'Alerts', detail: 'Bookings and session updates', icon: Bell },
  { href: '/my-wrestlers', label: 'My wrestlers', detail: 'Profiles and training details', icon: UsersRound },
  { href: '/my-coaches', label: 'My coaches', detail: 'Coaches you follow', icon: HeartHandshake },
  { href: '/wallet', label: 'Wallet', detail: 'Credits and payment activity', icon: CircleDollarSign },
  { href: '/account', label: 'Account', detail: 'Contact information and settings', icon: UserRound },
] as const;

export default function MorePage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-foreground">More</h1>
      <div className="mt-5 overflow-hidden rounded-xl border border-border/80 bg-card">
        {LINKS.map(({ href, label, detail, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-[68px] items-center gap-3 border-b border-border/70 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
    </main>
  );
}
