import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { getTenantByDomain } from '@/config/tenants';
import { createClient } from '@/lib/supabase/server';
import { fetchCoachMapPins } from '@/lib/map/fetch-coach-map-pins';
import { CoachMapShell } from '@/components/map/coach-map-shell';
import { PublicOpenJoinSessionsTable } from '@/components/map/public-open-join-sessions-table';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';
import Link from 'next/link';

export const metadata = {
  title: 'Find Wrestling Coaches Near You in North Carolina | The Guild',
  description:
    'Train with NCAA wrestlers and elite coaches near you. Browse The Guild coach network across North Carolina — Raleigh, Charlotte, Chapel Hill, and beyond.',
};

export const dynamic = 'force-dynamic';

export default async function CoachesMapPage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) notFound();

  const result = await fetchCoachMapPins(tenant.slug);
  const pins = result.ok ? result.pins : [];
  const cities = result.ok ? result.cities : [];
  const initialStats = result.ok ? result.stats : null;
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

  const supabase = await createClient(tenant.slug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const parentWrestlerIds = user ? await getParentYouthWrestlerIds(supabase, user.id) : [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: pins.slice(0, 40).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'LocalBusiness',
        name: `${p.firstName} ${p.lastName} — ${p.facilityName}`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: p.facilityAddress?.split(',')[0]?.trim() ?? 'North Carolina',
          addressRegion: 'NC',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: p.latitude,
          longitude: p.longitude,
        },
      },
    })),
  };

  return (
    <main className="min-h-screen bg-black px-4 py-10 md:px-8">
      <Script
        id="coaches-map-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-6xl">
        <nav className="mb-6 text-sm text-white/50">
          <Link href="/" className="text-accent hover:underline">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-white/70">Coach map</span>
        </nav>
        <h1 className="font-serif text-3xl font-black uppercase tracking-wide text-accent md:text-4xl">
          Find Wrestling Coaches Near You
        </h1>
        <div className="mt-4 max-w-2xl space-y-3 text-sm text-white/65">
          <p>
            <span className="font-semibold text-accent/90">1.</span> Find a coach, then{' '}
            <span className="text-white/85">book private or partner</span>
            —invite your partner when you select partner.
          </p>
          <p>
            <span className="font-semibold text-accent/90">2.</span>{' '}
            <span className="text-white/85">Browse open partner sessions and small groups</span> in the table below.
            Filters are above the map; pan and zoom to judge distance.
          </p>
        </div>

        <div className="mt-8">
          <CoachMapShell
            accessToken={accessToken}
            initialPins={pins}
            initialCities={cities}
            initialStats={initialStats}
            showFiltersBelowMap={false}
          />
        </div>

        <PublicOpenJoinSessionsTable
          tenantSlug={tenant.slug}
          isLoggedIn={Boolean(user)}
          parentWrestlerIds={parentWrestlerIds}
          loginReturnPath="/coaches/map#open-sessions"
        />

        {!accessToken && (
          <p className="mt-4 text-center text-xs text-white/40">
            Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable the interactive map.
          </p>
        )}

        <p className="mt-8 text-center text-xs text-white/35">
          <Link href="/login" className="text-accent/80 hover:underline">
            Log in
          </Link>{' '}
          to book sessions.{' '}
          <Link href="/signup" className="text-accent/80 hover:underline">
            Create an account
          </Link>{' '}
          to get started.
        </p>
      </div>
    </main>
  );
}
