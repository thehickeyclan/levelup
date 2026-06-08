'use client';

import Link from 'next/link';
import { User, UserPlus, Users, UsersRound } from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';

function trainingPath(
  isBooker: boolean,
  params: Record<string, string>
): { href: string } {
  const qs = new URLSearchParams({ tab: 'coaches', ...params });
  const path = `/training?${qs.toString()}`;
  if (isBooker) return { href: path };
  return { href: `/login?redirect=${encodeURIComponent(path)}` };
}

const cardBase =
  'group flex flex-col rounded-xl border border-[#D4AF37]/35 bg-zinc-950/80 p-5 text-left transition-colors hover:border-[#D4AF37]/60 hover:bg-zinc-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50';

export function TrainingPathCards() {
  const { user, effectiveRole } = useAuth();
  const isBooker =
    !!user &&
    (effectiveRole === 'parent' || effectiveRole === 'admin' || effectiveRole === 'youth_wrestler');

  const privateHref = trainingPath(isBooker, { type: 'private' });
  const partnerStartHref = trainingPath(isBooker, { type: 'partner' });

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div>
        <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]/80">
          Book a coach — you pick the time
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href={privateHref.href} className={cn(cardBase, 'min-h-[132px]')}>
            <User className="mb-3 h-8 w-8 text-[#D4AF37]" aria-hidden />
            <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#D4AF37]">
              Private training
            </h3>
            <p className="mt-2 text-sm text-white/70">
              Browse coaches and book a 1:1 session on their live calendar — all skill levels.
            </p>
            <span className="mt-auto pt-4 text-xs font-semibold uppercase tracking-wide text-[#D4AF37]/90 group-hover:underline">
              Browse coaches
            </span>
          </Link>

          <Link href={partnerStartHref.href} className={cn(cardBase, 'min-h-[132px]')}>
            <UserPlus className="mb-3 h-8 w-8 text-[#D4AF37]" aria-hidden />
            <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#D4AF37]">
              Start a partner booking
            </h3>
            <p className="mt-2 text-sm text-white/70">
              You book the coach, then share a link so your partner can join and pay.
            </p>
            <span className="mt-auto pt-4 text-xs font-semibold uppercase tracking-wide text-[#D4AF37]/90 group-hover:underline">
              Start booking
            </span>
          </Link>
        </div>
      </div>

      <div>
        <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
          Join open sessions — spots already posted
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/?table=partner#open-sessions" className={cn(cardBase, 'min-h-[132px]')}>
            <Users className="mb-3 h-8 w-8 text-[#D4AF37]" aria-hidden />
            <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#D4AF37]">
              Join a partner session
            </h3>
            <p className="mt-2 text-sm text-white/70">
              Grab an open partner spot — see who&apos;s registered (age, weight, level) before you join.
            </p>
            <span className="mt-auto pt-4 text-xs font-semibold uppercase tracking-wide text-[#D4AF37]/90 group-hover:underline">
              See open sessions
            </span>
          </Link>

          <Link href="/?table=group#open-sessions" className={cn(cardBase, 'min-h-[132px]')}>
            <UsersRound className="mb-3 h-8 w-8 text-[#D4AF37]" aria-hidden />
            <h3 className="font-serif text-base font-bold uppercase tracking-wide text-[#D4AF37]">
              Small group
            </h3>
            <p className="mt-2 text-sm text-white/70">
              Join a posted group when a coach has opened spots — athlete fit shown on each card.
            </p>
            <span className="mt-auto pt-4 text-xs font-semibold uppercase tracking-wide text-[#D4AF37]/90 group-hover:underline">
              View groups
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
