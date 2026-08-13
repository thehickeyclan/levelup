import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantFromRequestHeaders } from '@/config/tenants';

export const dynamic = 'force-dynamic';

type SharedListing = {
  id: string;
  title: string | null;
  brand: string | null;
  model: string | null;
  size: number | null;
  listing_type: string | null;
  status: string;
  price_cents: number | null;
  market_listing_images:
    | { public_url: string | null; clean_public_url: string | null; use_clean: boolean | null; display_order: number | null }[]
    | null;
};

async function loadSharedListing(id: string): Promise<SharedListing | null> {
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (!tenant) return null;
  const admin = createAdminClient(tenant.slug);
  const { data } = await admin
    .from('market_listings')
    .select(
      'id, title, brand, model, size, listing_type, status, price_cents, market_listing_images(public_url, clean_public_url, use_clean, display_order)'
    )
    .eq('id', id)
    .maybeSingle();
  return (data as SharedListing) ?? null;
}

function coverUrl(listing: SharedListing): string | null {
  const images = [...(listing.market_listing_images ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );
  const first = images[0];
  if (!first) return null;
  return (first.use_clean && first.clean_public_url) || first.public_url || first.clean_public_url;
}

function listingName(listing: SharedListing): string {
  return (
    listing.title?.trim() ||
    [listing.brand, listing.model].filter(Boolean).join(' ').trim() ||
    'Wrestling shoes'
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await loadSharedListing(id);
  if (!listing) return { title: 'Guild Market' };
  const name = listingName(listing);
  const price =
    listing.price_cents != null && listing.price_cents > 0
      ? ` · $${Math.round(listing.price_cents / 100)}`
      : '';
  const image = coverUrl(listing);
  const description = `${name}${price} on Guild Market — wrestling shoes from the Guild community.`;
  return {
    title: `${name} · Guild Market`,
    description,
    openGraph: {
      title: `${name}${price}`,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name}${price}`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** Public share landing for a listing — crawlable for link previews; humans get routed into the app/site. */
export default async function SharedListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await loadSharedListing(id);

  // Signed-in members go straight to the real listing.
  const headersList = await headers();
  const tenant = getTenantFromRequestHeaders(headersList);
  if (tenant) {
    const supabase = await createClient(tenant.slug);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect(`/market/listing/${id}`);
  }

  if (!listing) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6">
        <p className="text-muted-foreground">This listing is no longer available.</p>
      </main>
    );
  }

  const image = coverUrl(listing);
  const name = listingName(listing);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 space-y-4 text-center">
        <p className="text-xs tracking-[0.2em] text-accent font-semibold">GUILD MARKET</p>
        {image ? (
          <div className="relative w-full aspect-square rounded-lg bg-white overflow-hidden">
            <Image src={image} alt={name} fill sizes="384px" className="object-contain" unoptimized />
          </div>
        ) : null}
        <h1 className="text-xl font-semibold">{name}</h1>
        <p className="text-sm text-muted-foreground">
          {listing.size ? `Size ${listing.size} · ` : ''}
          {listing.price_cents != null && listing.price_cents > 0
            ? `$${Math.round(listing.price_cents / 100)}`
            : listing.listing_type === 'trade'
              ? 'Open to trade'
              : 'In a Guild collection'}
        </p>
        <Link
          href={`/login?redirect=/market/listing/${listing.id}`}
          className="block w-full rounded-lg bg-accent text-accent-foreground font-semibold py-3"
        >
          View on The Guild
        </Link>
        <p className="text-xs text-muted-foreground">
          Guild Market is where the wrestling community buys, sells, and trades shoes.
        </p>
      </div>
    </main>
  );
}
