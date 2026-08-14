import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getTenantByDomain } from '@/config/tenants';

export default async function MarketLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  // Browsing the market is public. Buying, selling, offers, orders, and
  // collections are gated per-route (middleware + page/API guards).
  return (
    <div className="theme-market min-h-screen bg-background text-foreground border-t border-accent/30">
      {children}
    </div>
  );
}
