import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';
import { primaryListingImageUrl } from '@/lib/market/listing-images';

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
    imageUrl?: string | null;
  }[] = [];

  // No email yet: live view of everyone who has hearted, newest first.
  let recentHearts: {
    name: string;
    email: string;
    shoe: string;
    listingId: string | null;
    imageUrl: string | null;
    at: string;
  }[] = [];
  if (!query) {
    const { data: allFollows } = await admin
      .from('market_listing_follows')
      .select(
        'created_at, follower_id, market_listings(id, title, brand, model, market_listing_images(public_url, clean_public_url, use_clean, display_order))'
      )
      .order('created_at', { ascending: false })
      .limit(100);
    const userIds = [...new Set((allFollows ?? []).map((f) => f.follower_id as string))];
    const { data: userRows } = userIds.length
      ? await admin.from('users').select('id, email, first_name, last_name').in('id', userIds)
      : { data: [] };
    const byId = new Map((userRows ?? []).map((u) => [u.id as string, u]));
    recentHearts = (allFollows ?? []).map((f) => {
      const u = byId.get(f.follower_id as string);
      const l = (Array.isArray(f.market_listings) ? f.market_listings[0] : f.market_listings) as {
        id?: string;
        title?: string | null;
        brand?: string | null;
        model?: string | null;
        market_listing_images?: Parameters<typeof primaryListingImageUrl>[0];
      } | null;
      return {
        name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || (u?.email as string) || 'Unknown',
        email: (u?.email as string) ?? '',
        shoe: l?.title || [l?.brand, l?.model].filter(Boolean).join(' ') || 'Listing',
        listingId: l?.id ?? null,
        imageUrl: l?.market_listing_images ? primaryListingImageUrl(l.market_listing_images) : null,
        at: f.created_at as string,
      };
    });
  }

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
        .select(
          'created_at, market_listings(id, title, brand, model, size, listing_type, status, price_cents, market_listing_images(public_url, clean_public_url, use_clean, display_order))'
        )
        .eq('follower_id', member.id)
        .order('created_at', { ascending: false });
      favorites = (follows ?? [])
        .map((f) => {
          const l = Array.isArray(f.market_listings) ? f.market_listings[0] : f.market_listings;
          if (!l) return null;
          const row = l as Omit<(typeof favorites)[number], 'hearted_at' | 'imageUrl'> & {
            market_listing_images?: Parameters<typeof primaryListingImageUrl>[0];
          };
          return {
            ...row,
            imageUrl: row.market_listing_images ? primaryListingImageUrl(row.market_listing_images) : null,
            hearted_at: f.created_at as string,
          };
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

      {!query ? (
        recentHearts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hearts yet — they&apos;ll appear here live as people favorite pairs.</p>
        ) : (
          <>
            <p className="text-sm font-semibold mb-3">
              {recentHearts.length} recent heart{recentHearts.length === 1 ? '' : 's'} ·{' '}
              {new Set(recentHearts.map((h) => h.email)).size} member
              {new Set(recentHearts.map((h) => h.email)).size === 1 ? '' : 's'}
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {recentHearts.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {h.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={h.imageUrl}
                        alt={h.shoe}
                        className="h-12 w-12 rounded-md object-contain bg-muted shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-md bg-muted shrink-0" />
                    )}
                    <div className="min-w-0">
                      <Link
                        href={`/admin/market/favorites?email=${encodeURIComponent(h.email)}`}
                        className="text-sm font-semibold text-accent hover:underline"
                      >
                        {h.name}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">
                        ♥{' '}
                        {h.listingId ? (
                          <Link href={`/market/listing/${h.listingId}`} className="hover:underline">
                            {h.shoe}
                          </Link>
                        ) : (
                          h.shoe
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(h.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}

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
                  <div className="flex items-center gap-3 min-w-0">
                    {f.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.imageUrl}
                        alt=""
                        className="h-14 w-14 rounded-md object-contain bg-muted shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-md bg-muted shrink-0" />
                    )}
                    <div className="min-w-0">
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
