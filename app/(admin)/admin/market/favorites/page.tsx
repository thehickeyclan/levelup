import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';

export const dynamic = 'force-dynamic';

/**
 * Raffle draw-time tool: look up a member by email and see every shoe they've
 * hearted, so a physical-box winner can be awarded their favorite pair.
 */
export default async function AdminMarketFavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) notFound();

  const supabase = await createClient(tenant.slug);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (userData?.role !== 'admin') redirect('/admin');

  const { email } = await searchParams;
  const query = (email ?? '').trim().toLowerCase();

  const admin = createAdminClient(tenant.slug);
  type Member = { id: string; email: string; first_name: string | null; last_name: string | null };
  let member: Member | null = null;
  let favorites: {
    id: string;
    title: string | null;
    brand: string | null;
    model: string | null;
    size: number | null;
    listing_type: string;
    status: string;
    price_cents: number | null;
    hearted_at: string;
  }[] = [];

  if (query) {
    const { data: u } = await admin
      .from('users')
      .select('id, email, first_name, last_name')
      .ilike('email', query)
      .maybeSingle();
    member = (u as Member | null) ?? null;

    if (member) {
      const { data: follows } = await admin
        .from('market_listing_follows')
        .select('created_at, market_listings(id, title, brand, model, size, listing_type, status, price_cents)')
        .eq('follower_id', member.id)
        .order('created_at', { ascending: false });
      favorites = (follows ?? [])
        .map((f) => {
          const l = Array.isArray(f.market_listings) ? f.market_listings[0] : f.market_listings;
          if (!l) return null;
          return { ...(l as Omit<(typeof favorites)[number], 'hearted_at'>), hearted_at: f.created_at as string };
        })
        .filter(Boolean) as typeof favorites;
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Member favorites lookup</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Raffle winner? Enter the email from their ticket to see every pair they&apos;ve hearted.
      </p>

      <form method="get" className="flex gap-2 mb-8">
        <input
          type="email"
          name="email"
          defaultValue={query}
          placeholder="member@email.com"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          Look up
        </button>
      </form>

      {query && !member ? (
        <p className="text-sm text-muted-foreground">
          No account found for <span className="font-semibold">{query}</span>. Check the spelling on
          the ticket — it must match the email they signed up with.
        </p>
      ) : null}

      {member ? (
        <>
          <p className="text-sm mb-4">
            <span className="font-semibold">
              {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.email}
            </span>{' '}
            · {member.email} · {favorites.length} hearted pair{favorites.length === 1 ? '' : 's'}
          </p>
          {favorites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              They haven&apos;t hearted any pairs yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {favorites.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <Link
                      href={`/market/listing/${f.id}`}
                      className="text-sm font-semibold text-accent hover:underline"
                    >
                      {f.title || [f.brand, f.model].filter(Boolean).join(' ') || 'Listing'}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {f.size != null ? `Size ${f.size} · ` : ''}
                      {f.listing_type === 'sell' ? 'For sale' : f.listing_type === 'trade' ? 'For trade' : 'Collection'} ·{' '}
                      {f.status}
                      {f.price_cents != null ? ` · $${(f.price_cents / 100).toFixed(0)}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    ♥ {new Date(f.hearted_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
