import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenantByDomain } from '@/config/tenants';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';
import Link from 'next/link';
import { User, Wallet, Bell, ChevronRight, Users, DollarSign } from 'lucide-react';
import { AccountSignOut } from '@/components/account-sign-out';
import { RedeemCodeCard } from './redeem-code-card';
import { AccountPhoneCard } from './account-phone-card';
import { AccountZipCard } from './account-zip-card';
import { getUserCreditBalance } from '@/lib/credits';
import { AccountRewardsSection } from '@/components/account-rewards-section';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userData } = await supabase.from('users').select('role, phone, email, zip_code').eq('id', user.id).maybeSingle();

  if (userData?.role === 'coach') redirect('/athlete-dashboard');

  if (userData?.role === 'youth_wrestler') {
    const userEmail = user.email ?? '';
    const userPhone = (userData as { phone?: string | null })?.phone;
    const userZip = (userData as { zip_code?: string | null })?.zip_code ?? null;
    return (
      <div className="min-h-screen pb-24">
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-foreground">Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">{userEmail}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your cell number is required so coaches and session updates can reach you by text.
          </p>
        </div>
        <div className="px-4 space-y-3">
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden divide-y divide-zinc-800/50">
            <AccountPhoneCard initialPhone={userPhone ?? null} compact />
            <AccountZipCard initialZip={userZip} compact />
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              href="/youth-dashboard"
              className="text-sm font-medium text-[#D4AF37] hover:text-[#E5C76B]"
            >
              ← Back to Home
            </Link>
            <AccountSignOut />
          </div>
        </div>
      </div>
    );
  }

  if (userData?.role !== 'parent' && userData?.role !== 'admin') redirect('/dashboard');

  // Wrestlers this parent can manage (primary or linked)
  const youthWrestlerIds = await getParentYouthWrestlerIds(supabase, user.id);
  const wrestlerCount = youthWrestlerIds.length;
  const { data: wrestlersPreviewRaw } =
    youthWrestlerIds.length > 0
      ? await supabase
          .from('youth_wrestlers')
          .select('id, first_name, last_name')
          .in('id', youthWrestlerIds)
          .order('first_name', { ascending: true })
      : { data: [] };
  const wrestlersPreview = (wrestlersPreviewRaw ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
  }[];

  // Get credit balance
  const creditBalance = await getUserCreditBalance(user.id, tenant.slug);

  // Spending summary: sum cash paid per roster row (not sessions.total_price — often wrong for
  // multi-seat pricing, missing values, or multiple wrestlers on the same session).
  let totalSpent = 0;
  if (youthWrestlerIds.length > 0) {
    const { data: partRows } = await supabase
      .from('session_participants')
      .select('session_id, amount_paid, paid')
      .in('youth_wrestler_id', youthWrestlerIds);
    const familySessionIds = [...new Set((partRows ?? []).map((r: { session_id: string }) => r.session_id))];

    if (familySessionIds.length > 0) {
      const { data: sessionsForSpend } = await supabase
        .from('sessions')
        .select('id, refunded_at')
        .in('id', familySessionIds)
        .in('status', ['scheduled', 'completed', 'no-show']);

      const spendEligibleSessionIds = new Set(
        (sessionsForSpend ?? [])
          .filter((s: { refunded_at?: string | null }) => !s.refunded_at)
          .map((s: { id: string }) => s.id)
      );

      totalSpent = (partRows ?? []).reduce((sum: number, row: { session_id: string; amount_paid?: unknown; paid?: boolean }) => {
        if (!spendEligibleSessionIds.has(row.session_id)) return sum;
        const ap = Number(row.amount_paid ?? 0);
        if (ap <= 0) return sum;
        return sum + ap;
      }, 0);
    }
  }

  const userEmail = user.email ?? '';
  const userPhone = (userData as { phone?: string | null })?.phone;
  const userZip = (userData as { zip_code?: string | null })?.zip_code ?? null;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-6">
        <h1 className="text-2xl font-bold text-foreground">Account</h1>
      </div>

      {/* Profile Section */}
      <div className="px-4 mb-6">
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8960C] flex items-center justify-center">
              <User className="h-7 w-7 text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg truncate">{userEmail}</p>
              {userPhone && (
                <p className="text-sm text-zinc-500">{userPhone}</p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800/50 pt-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Wallet className="h-4 w-4 shrink-0 text-[#D4AF37]" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500">Available credit</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      ${creditBalance.toFixed(2)}
                    </p>
                  </div>
                </div>
                <Link
                  href="/wallet"
                  className="shrink-0 self-center py-2 text-xs font-medium text-[#D4AF37] hover:text-[#E5C76B]"
                >
                  Details
                </Link>
              </div>
              <p className="mt-1.5 text-xs text-zinc-600">
                Applied automatically at checkout. Use on any coach.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="px-4 mb-6">
        <div className="grid grid-cols-3 gap-3">
          <Link href="/my-wrestlers">
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 text-center hover:border-zinc-700 transition-colors">
              <Users className="h-5 w-5 mx-auto mb-2 text-[#D4AF37]" />
              <p className="text-2xl font-bold">{wrestlerCount}</p>
              <p className="text-xs text-zinc-500">Wrestlers</p>
            </div>
          </Link>
          <Link href="/wallet">
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 text-center hover:border-zinc-700 transition-colors">
              <Wallet className="h-5 w-5 mx-auto mb-2 text-[#D4AF37]" />
              <p className="text-2xl font-bold tabular-nums">${creditBalance.toFixed(2)}</p>
              <p className="text-xs text-zinc-500">Credit</p>
            </div>
          </Link>
          <Link href="/bookings">
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 text-center hover:border-zinc-700 transition-colors">
              <DollarSign className="h-5 w-5 mx-auto mb-2 text-[#D4AF37]" />
              <p className="text-2xl font-bold">${totalSpent.toFixed(0)}</p>
              <p className="text-xs text-zinc-500">Paid</p>
            </div>
          </Link>
        </div>
      </div>

      {wrestlersPreview.length > 0 && (
        <div className="px-4 mb-6">
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Your wrestlers</p>
            <ul className="space-y-2">
              {wrestlersPreview.map((w) => {
                const name = [w.first_name, w.last_name].filter(Boolean).join(' ') || 'Wrestler';
                return (
                  <li key={w.id}>
                    <Link
                      href={`/wrestlers/${w.id}`}
                      className="flex items-center justify-between gap-2 py-2 text-sm font-medium text-foreground hover:text-[#D4AF37] border-b border-zinc-800/40 last:border-0"
                    >
                      <span>{name}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/my-wrestlers"
              className="mt-3 inline-block text-xs font-medium text-[#D4AF37] hover:text-[#E5C76B]"
            >
              View all & manage →
            </Link>
          </div>
        </div>
      )}

      <div className="px-4 mb-6">
        <AccountRewardsSection />
      </div>

      {/* Menu Sections */}
      <div className="px-4 space-y-3">
        {/* Wrestlers */}
        <MenuSection title="Wrestlers">
          <MenuItem href="/my-wrestlers" icon={Users} label="My Wrestlers" />
          <MenuItem href="/wrestlers/add" icon={User} label="Add Wrestler" />
        </MenuSection>

        {/* Wallet & Payments */}
        <MenuSection title="Wallet & Payments">
          <MenuItem href="/wallet" icon={Wallet} label="My Wallet" badge={creditBalance > 0 ? `$${creditBalance.toFixed(2)}` : undefined} />
          <MenuItem href="/bookings" icon={DollarSign} label="Booking History" />
        </MenuSection>

        {/* Settings */}
        <MenuSection title="Settings">
          <AccountPhoneCard initialPhone={userPhone ?? null} compact />
          <AccountZipCard initialZip={userZip} compact />
          <MenuItem href="/notifications" icon={Bell} label="Notifications" />
        </MenuSection>

        {/* Promo & Rewards */}
        <MenuSection title="Rewards">
          <RedeemCodeCard compact />
        </MenuSection>

        {/* Sign Out */}
        <div className="pt-4">
          <AccountSignOut />
        </div>
      </div>
    </div>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 px-1">{title}</h2>
      <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden divide-y divide-zinc-800/50">
        {children}
      </div>
    </div>
  );
}

function MenuItem({ 
  href, 
  icon: Icon, 
  label, 
  badge 
}: { 
  href: string; 
  icon: React.ComponentType<{ className?: string }>; 
  label: string;
  badge?: string;
}) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-800/50 transition-colors">
        <Icon className="h-5 w-5 text-zinc-400" />
        <span className="flex-1 font-medium">{label}</span>
        {badge && (
          <span className="text-sm text-[#D4AF37] font-medium">{badge}</span>
        )}
        <ChevronRight className="h-4 w-4 text-zinc-600" />
      </div>
    </Link>
  );
}
