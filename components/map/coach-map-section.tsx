import { fetchCoachMapPins } from '@/lib/map/fetch-coach-map-pins';
import { CoachMapShell } from '@/components/map/coach-map-shell';
import { PublicOpenJoinSessionsTable } from '@/components/map/public-open-join-sessions-table';
import { createClient } from '@/lib/supabase/server';
import { getParentYouthWrestlerIds } from '@/lib/parent-wrestlers';

export async function CoachMapSection({
  tenantSlug,
  openSessionsRowFilter = 'all',
}: {
  tenantSlug: string;
  openSessionsRowFilter?: 'all' | 'partner' | 'small_group';
}) {
  const result = await fetchCoachMapPins(tenantSlug);
  const pins = result.ok ? result.pins : [];
  const cities = result.ok ? result.cities : [];
  const initialStats = result.ok ? result.stats : null;
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

  const uniqueCoachIds = new Set(pins.map((p) => p.coachId));
  const coachCount = uniqueCoachIds.size;
  const cityCount = cities.length;

  const supabase = await createClient(tenantSlug);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoggedIn = Boolean(user);
  const parentWrestlerIds = user ? await getParentYouthWrestlerIds(supabase, user.id) : [];

  return (
    <section className="border-t border-accent/20 bg-black py-12 px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-serif text-xl font-black uppercase tracking-wide text-accent md:text-2xl">
          Find coaches near you
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-white/60">
          {coachCount > 0 && cityCount > 0
            ? `${coachCount} coaches across ${cityCount} ${cityCount === 1 ? 'city' : 'cities'} — pan and zoom to explore.`
            : 'Pan and zoom the map to see who\u2019s near you.'}
        </p>

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
          tenantSlug={tenantSlug}
          rowKindFilter={openSessionsRowFilter}
          isLoggedIn={isLoggedIn}
          parentWrestlerIds={parentWrestlerIds}
          loginReturnPath={
            openSessionsRowFilter === 'partner'
              ? '/?table=partner#open-sessions'
              : openSessionsRowFilter === 'small_group'
                ? '/?table=group#open-sessions'
                : '/#open-sessions'
          }
        />

        {!accessToken && (
          <p className="mt-4 text-center text-xs text-white/40">
            Set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to enable the interactive map.
          </p>
        )}
      </div>
    </section>
  );
}
