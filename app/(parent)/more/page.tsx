import Link from 'next/link';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  HeartHandshake,
  MessageSquare,
  UserRound,
  UsersRound,
} from 'lucide-react';

const SECTIONS = [
  {
    label: 'Training',
    links: [
      { href: '/bookings', label: 'My training', detail: 'Upcoming and past sessions', icon: CalendarDays },
      { href: '/my-wrestlers', label: 'My wrestlers', detail: 'Profiles and training details', icon: UsersRound },
      { href: '/my-coaches', label: 'My coaches', detail: 'Coaches you follow', icon: HeartHandshake },
    ],
  },
  {
    label: 'Communication',
    links: [
      { href: '/inbox', label: 'Inbox', detail: 'Coaches, sessions, and Market', icon: MessageSquare },
      { href: '/notifications', label: 'Alerts', detail: 'Booking and session updates', icon: Bell },
    ],
  },
  {
    label: 'Payments',
    links: [
      { href: '/wallet', label: 'Wallet', detail: 'Credits and payment activity', icon: CircleDollarSign },
    ],
  },
  {
    label: 'Account',
    links: [
      { href: '/account', label: 'Account & support', detail: 'Profile, preferences, and help', icon: UserRound },
    ],
  },
] as const;

export default function MorePage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-24 pt-6">
      <h1 className="text-2xl font-bold text-foreground">More</h1>
      <div className="mt-5 space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.label} aria-labelledby={`more-${section.label.toLowerCase()}`}>
            <h2
              id={`more-${section.label.toLowerCase()}`}
              className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {section.label}
            </h2>
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
              {section.links.map(({ href, label, detail, icon: Icon }) => (
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
          </section>
        ))}
      </div>
    </main>
  );
}
