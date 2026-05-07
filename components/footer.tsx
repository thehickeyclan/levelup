'use client';

import Link from 'next/link';
import { useTenant } from './theme-provider';
import { useAuth } from '@/lib/auth/use-auth';
import { Instagram, Facebook } from 'lucide-react';

export function Footer() {
  const tenant = useTenant();
  const { effectiveRole, loading, user } = useAuth();

  /** Logged-in coaches were hitting /earnings (marketing) instead of payouts. */
  const wrestlerCoachesEarningsHref =
    !loading && !!user && effectiveRole === 'coach' ? '/coach-earnings' : '/earnings';
  const wrestlerCoachesEarningsLabel =
    !loading && !!user && effectiveRole === 'coach' ? 'Your payouts' : 'Earnings';

  return (
    <footer className="bg-primary text-white py-12 mt-auto border-t border-accent/20">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-1">
            <div className="mb-4">
              <h3 className="text-3xl font-serif font-bold text-accent">
                THE GUILD
              </h3>
              <div className="h-1 w-16 bg-accent mt-2" />
            </div>
            <p className="text-white/80 text-sm mb-2">
              Elite wrestling technique instruction
            </p>
            <p className="text-white/60 text-sm">{tenant.tagline}</p>
          </div>
          <div>
            <h4 className="font-semibold text-lg mb-4 text-accent">
              For Parents
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/browse"
                  className="block py-2.5 text-white/80 hover:text-accent transition-colors min-h-[44px] flex items-center"
                >
                  Browse Coaches
                </Link>
              </li>
              <li>
                <Link
                  href="/how-it-works"
                  className="block py-2.5 text-white/80 hover:text-accent transition-colors min-h-[44px] flex items-center"
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="block py-2.5 text-white/80 hover:text-accent transition-colors min-h-[44px] flex items-center"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/faqs"
                  className="block py-2.5 text-white/80 hover:text-accent transition-colors min-h-[44px] flex items-center"
                >
                  FAQs
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-lg mb-4 text-accent">
              For NCAA Wrestlers & Coaches
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/signup"
                  className="block py-2.5 text-white/80 hover:text-accent transition-colors min-h-[44px] flex items-center"
                >
                  Join The Guild
                </Link>
              </li>
              <li>
                <Link
                  href="/requirements"
                  className="block py-2.5 text-white/80 hover:text-accent transition-colors min-h-[44px] flex items-center"
                >
                  Requirements
                </Link>
              </li>
              <li>
                <Link
                  href={wrestlerCoachesEarningsHref}
                  className="block py-2.5 text-white/80 hover:text-accent transition-colors min-h-[44px] flex items-center"
                >
                  {wrestlerCoachesEarningsLabel}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-lg mb-4 text-accent">Company</h4>
            <ul className="space-y-2 text-sm mb-6">
              <li>
                <Link
                  href="/about"
                  className="text-white/80 hover:text-accent transition-colors"
                >
                  About The Guild
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-white/80 hover:text-accent transition-colors"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-white/80 hover:text-accent transition-colors"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-white/80 hover:text-accent transition-colors"
                >
                  Terms
                </Link>
              </li>
            </ul>
            <div className="text-sm">
              <p className="text-white/80 mb-1">{tenant.supportEmail}</p>
              <p className="text-white/80 mb-1">{tenant.phone}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 sm:pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
            <p className="text-sm text-white/60">
              © {new Date().getFullYear()} The Guild. Contact:{' '}
              <a href="mailto:info@WrestlingGuild.com" className="text-accent hover:underline">
                info@WrestlingGuild.com
              </a>
            </p>
            <div className="flex gap-4">
              <a
                href="https://www.instagram.com/WrestlingGuild/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 -m-3 text-accent hover:text-accent-hover transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Instagram @WrestlingGuild"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="p-3 -m-3 text-accent hover:text-accent-hover transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Facebook"
              >
                <Facebook className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
