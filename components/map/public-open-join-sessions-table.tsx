import Link from 'next/link';
import { fetchPublicOpenJoinSummaries } from '@/lib/map/fetch-public-open-join-summaries';
import { formatEST } from '@/lib/format-date';
import { Badge } from '@/components/ui/badge';
import { PublicOpenJoinSessionCartAction } from '@/components/map/public-open-join-session-cart-action';

export async function PublicOpenJoinSessionsTable({
  tenantSlug,
  rowKindFilter = 'all',
  isLoggedIn,
  parentWrestlerIds = [],
  loginReturnPath = '/#open-sessions',
}: {
  tenantSlug: string;
  rowKindFilter?: 'all' | 'partner' | 'small_group';
  isLoggedIn: boolean;
  parentWrestlerIds?: string[];
  /** Where guests land after login so they can use + Add on this table. */
  loginReturnPath?: string;
}) {
  const { rows: rowsAll, openSessionCountTodayByFilter } = await fetchPublicOpenJoinSummaries(tenantSlug, {
    daysAhead: 21,
    maxCoaches: 60,
  });
  const rows =
    rowKindFilter === 'all'
      ? rowsAll
      : rowKindFilter === 'partner'
        ? rowsAll.filter((r) => r.kind === 'Partner')
        : rowsAll.filter((r) => r.kind === 'Small group');

  const todayCount =
    rowKindFilter === 'all'
      ? openSessionCountTodayByFilter.all
      : rowKindFilter === 'partner'
        ? openSessionCountTodayByFilter.partner
        : openSessionCountTodayByFilter.small_group;

  const loginWithRedirect = (path: string) => `/login?redirect=${encodeURIComponent(path)}`;

  return (
    <div
      id="open-sessions"
      className="mt-10 scroll-mt-24 rounded-xl border border-accent/25 bg-black/50 px-4 py-6 md:px-6"
    >
      <h3 className="font-serif text-lg font-bold uppercase tracking-wide text-accent md:text-xl">
        Upcoming training
      </h3>
      <div className="mt-2 max-w-2xl space-y-2 text-sm text-white/70">
        <p>
          See the complete upcoming schedule. Sessions with open spots can be added now; full and booked private
          sessions are shown for clarity.
        </p>
        <p>
          For a fresh private or partner booking on your own schedule, start from a coach on the map above (or Training
          after you sign in).
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-white/50">
          No matching sessions in the next few weeks.{' '}
          <Link href="/signup" className="text-accent underline-offset-2 hover:underline">
            Create an account
          </Link>{' '}
          or{' '}
          <Link href="/login" className="text-accent underline-offset-2 hover:underline">
            log in
          </Link>{' '}
          to start a booking with any coach.
        </p>
      ) : (
        <>
          <div className="mt-5 space-y-1">
            <p className="text-sm font-semibold text-white/90">
              {rows.length === 1 ? '1 upcoming session' : `${rows.length} upcoming sessions`}
              {todayCount > 0 ? ` · ${todayCount} open today` : ''}
            </p>
            <p className="text-xs text-white/45">Updates as coaches add spots.</p>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[720px] text-left text-sm text-white/85">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-white/45">
                  <th className="px-3 py-2.5 font-medium">Coach</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Openings</th>
                  <th className="px-3 py-2.5 font-medium">Session time</th>
                  <th className="px-3 py-2.5 font-medium">Where</th>
                  <th className="px-3 py-2.5 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isPartner = r.kind === 'Partner';
                  const isPrivate = r.kind === 'Private';
                  return (
                    <tr key={r.sessionId} className="border-b border-white/[0.06] last:border-0">
                      <td className="px-3 py-3">
                        <Link
                          href={`/athlete/${r.coachId}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {r.coachName}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant="outline"
                          className={
                            isPrivate
                              ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                              : isPartner
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                              : 'border-violet-500/50 bg-violet-500/10 text-violet-200'
                          }
                        >
                          {r.kind}
                        </Badge>
                      </td>
                      <td className="max-w-[11rem] px-3 py-3 text-white/70">{r.openingsLabel}</td>
                      <td className="px-3 py-3 text-white/80">{formatEST(r.scheduledAt, 'EEE MMM d · h:mm a')}</td>
                      <td className="px-3 py-3 text-white/65">{r.facilityName}</td>
                      <td className="px-3 py-3 text-right align-middle">
                        {r.isJoinable ? (
                          <PublicOpenJoinSessionCartAction
                            row={r}
                            isLoggedIn={isLoggedIn}
                            parentWrestlerIds={parentWrestlerIds}
                            loginReturnPath={loginReturnPath}
                          />
                        ) : (
                          <span className="whitespace-nowrap text-xs font-semibold text-white/40">
                            {isPrivate ? 'Private' : 'Full'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-6 text-center text-xs text-white/45">
        Want private training on your schedule?{' '}
        <Link
          href={isLoggedIn ? '/training?tab=coaches&type=private' : loginWithRedirect('/training?tab=coaches&type=private')}
          className="text-accent/90 underline-offset-2 hover:underline"
        >
          Browse coaches for private sessions
        </Link>
        .
      </p>
    </div>
  );
}
