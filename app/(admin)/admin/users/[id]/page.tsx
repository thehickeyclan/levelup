import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantByDomain } from '@/config/tenants';
import { BackLink } from '@/components/back-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatEST } from '@/lib/format-date';
import { getSessionTypeDisplay } from '@/lib/session-type-display';
import { getUserCreditBalance } from '@/lib/credits';
import { AdminCreateYouthWrestlerForm } from '@/components/admin-create-youth-wrestler-form';

export const dynamic = 'force-dynamic';

type YouthRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  active: boolean | null;
  parent_id: string | null;
};

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id?.trim()) notFound();

  const headersList = await headers();
  const host = headersList.get('host') || '';
  const tenant = getTenantByDomain(host);
  if (!tenant) redirect('/404');

  const supabase = await createClient(tenant.slug);
  const {
    data: { user: adminUser },
  } = await supabase.auth.getUser();
  if (!adminUser) redirect('/login');

  const { data: gate } = await supabase.from('users').select('role').eq('id', adminUser.id).single();
  if (gate?.role !== 'admin') redirect('/');

  const admin = createAdminClient(tenant.slug);
  const { data: row, error } = await admin
    .from('users')
    .select('id, email, role, created_at, last_login_at, archived_at, first_name, last_name, phone, zip_code')
    .eq('id', id)
    .maybeSingle();

  if (error || !row) notFound();

  const u = row as {
    id: string;
    email: string;
    role: string;
    created_at: string;
    last_login_at: string | null;
    archived_at: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    zip_code: string | null;
  };

  const displayName =
    [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
    (u.email.includes('@') ? u.email.split('@')[0] : u.email);

  let kidsSection: { rows: Array<YouthRow & { linkRelation: 'primary' | 'linked' }> } | null = null;
  let parentsSection: Array<{ id: string; email: string; relation: string }> | null = null;
  let coachAthlete: { school: string | null; active: boolean | null } | null = null;

  if (u.role === 'parent') {
    const byId = new Map<string, YouthRow & { linkRelation: 'primary' | 'linked' }>();

    const { data: primary } = await admin
      .from('youth_wrestlers')
      .select('id, first_name, last_name, active, parent_id')
      .eq('parent_id', u.id);

    for (const k of primary ?? []) {
      const y = k as YouthRow;
      byId.set(y.id, { ...y, linkRelation: 'primary' });
    }

    const { data: links } = await admin.from('youth_wrestler_parents').select('youth_wrestler_id').eq('parent_id', u.id);

    const linkedIds = [...new Set((links ?? []).map((l) => (l as { youth_wrestler_id: string }).youth_wrestler_id))];
    if (linkedIds.length > 0) {
      const { data: linkedKids } = await admin
        .from('youth_wrestlers')
        .select('id, first_name, last_name, active, parent_id')
        .in('id', linkedIds);
      for (const k of linkedKids ?? []) {
        const y = k as YouthRow;
        if (byId.has(y.id)) continue;
        byId.set(y.id, { ...y, linkRelation: 'linked' });
      }
    }

    kidsSection = { rows: [...byId.values()] };
  }

  if (u.role === 'youth_wrestler') {
    const { data: yw } = await admin
      .from('youth_wrestlers')
      .select('id, first_name, last_name, active, parent_id')
      .eq('id', u.id)
      .maybeSingle();

    const parentRows: Array<{ id: string; email: string; relation: string }> = [];

    if (yw) {
      const y = yw as YouthRow;
      if (y.parent_id) {
        const { data: p } = await admin.from('users').select('id, email').eq('id', y.parent_id).maybeSingle();
        if (p) {
          parentRows.push({
            id: (p as { id: string }).id,
            email: (p as { email: string }).email,
            relation: 'Primary parent',
          });
        }
      }

      const { data: extra } = await admin.from('youth_wrestler_parents').select('parent_id').eq('youth_wrestler_id', u.id);

      const extraIds = (extra ?? []).map((r) => (r as { parent_id: string }).parent_id).filter(Boolean);
      if (extraIds.length > 0) {
        const { data: usersRows } = await admin.from('users').select('id, email').in('id', extraIds);
        for (const pr of usersRows ?? []) {
          const pid = (pr as { id: string }).id;
          if (pid === y.parent_id) continue;
          parentRows.push({
            id: pid,
            email: (pr as { email: string }).email,
            relation: 'Linked parent',
          });
        }
      }
    }

    parentsSection = parentRows;
  }

  if (u.role === 'coach') {
    const { data: a } = await admin.from('athletes').select('school, active').eq('id', u.id).maybeSingle();
    if (a) coachAthlete = { school: (a as { school?: string }).school ?? null, active: (a as { active?: boolean }).active ?? null };
  }

  const { count: reviewCount } = await admin.from('reviews').select('id', { count: 'exact', head: true }).eq('parent_id', u.id);

  type ParentBookingAdminRow = {
    id: string;
    scheduled_datetime: string;
    status: string;
    session_type: string | null;
    session_mode: string | null;
    coachName: string;
    coachId: string | null;
    facilityName: string;
    wrestlerSummary: string;
    familyAmountPaid: number;
    isSessionBooker: boolean;
  };

  let parentWalletCredit = 0;
  let upcomingParentBookings: ParentBookingAdminRow[] = [];
  let historyParentBookings: ParentBookingAdminRow[] = [];

  if (u.role === 'parent') {
    parentWalletCredit = await getUserCreditBalance(u.id, tenant.slug);

    const youthIds = kidsSection?.rows.map((k) => k.id) ?? [];
    const sessionIdSet = new Set<string>();

    if (youthIds.length > 0) {
      const { data: partSess } = await admin.from('session_participants').select('session_id').in('youth_wrestler_id', youthIds);
      for (const r of partSess ?? []) {
        const sid = (r as { session_id?: string }).session_id;
        if (sid) sessionIdSet.add(sid);
      }
    }

    const { data: ownedSess } = await admin.from('sessions').select('id').eq('parent_id', u.id);
    for (const r of ownedSess ?? []) {
      const sid = (r as { id?: string }).id;
      if (sid) sessionIdSet.add(sid);
    }

    const allSessionIds = [...sessionIdSet];
    const nowISO = new Date().toISOString();

    if (allSessionIds.length > 0) {
      const { data: sessList } = await admin
        .from('sessions')
        .select(
          `
          id,
          scheduled_datetime,
          status,
          session_type,
          session_mode,
          parent_id,
          athlete_id,
          athletes(id, first_name, last_name),
          facilities(name),
          session_participants(youth_wrestler_id, amount_paid, paid, youth_wrestlers(first_name, last_name))
        `
        )
        .in('id', allSessionIds)
        .order('scheduled_datetime', { ascending: false });

      for (const raw of sessList ?? []) {
        const s = raw as {
          id: string;
          scheduled_datetime: string;
          status: string;
          session_type?: string | null;
          session_mode?: string | null;
          parent_id?: string | null;
          athlete_id?: string | null;
          athletes?: { id: string; first_name: string | null; last_name: string | null } | { id: string; first_name: string | null; last_name: string | null }[] | null;
          facilities?: { name: string | null } | { name: string | null }[] | null;
          session_participants?: Array<{
            youth_wrestler_id: string;
            amount_paid?: number | null;
            youth_wrestlers?: { first_name?: string | null; last_name?: string | null } | null;
          }>;
        };

        const ath = s.athletes;
        const coachObj = ath ? (Array.isArray(ath) ? ath[0] : ath) : null;
        const coachName = coachObj
          ? [coachObj.first_name, coachObj.last_name].filter(Boolean).join(' ').trim() || '—'
          : '—';
        const coachId = coachObj?.id ?? s.athlete_id ?? null;

        const fac = s.facilities;
        const facObj = fac ? (Array.isArray(fac) ? fac[0] : fac) : null;
        const facilityName = facObj?.name ?? '—';

        const participants = s.session_participants ?? [];
        let familyParts = participants.filter((p) => youthIds.includes(p.youth_wrestler_id));
        if (familyParts.length === 0 && s.parent_id === u.id && participants.length > 0) {
          familyParts = participants;
        }

        const wrestlerSummary = familyParts
          .map((p) => {
            const yw = p.youth_wrestlers;
            return yw ? [yw.first_name, yw.last_name].filter(Boolean).join(' ').trim() : '';
          })
          .filter(Boolean)
          .join(', ') || '—';

        const familyAmountPaid = familyParts.reduce((sum, p) => sum + Number(p.amount_paid ?? 0), 0);

        const rowOut: ParentBookingAdminRow = {
          id: s.id,
          scheduled_datetime: s.scheduled_datetime,
          status: s.status,
          session_type: s.session_type ?? null,
          session_mode: s.session_mode ?? null,
          coachName,
          coachId,
          facilityName,
          wrestlerSummary,
          familyAmountPaid,
          isSessionBooker: s.parent_id === u.id,
        };

        if (s.status === 'scheduled' && s.scheduled_datetime >= nowISO) {
          upcomingParentBookings.push(rowOut);
        } else {
          historyParentBookings.push(rowOut);
        }
      }

      upcomingParentBookings.sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime));
    }
  }

  const maxWidthClass = u.role === 'parent' ? 'max-w-5xl' : 'max-w-3xl';

  const sessionStatusBadge = (status: string) => {
    const closed = status === 'cancelled' || status === 'no-show';
    return (
      <Badge variant={closed ? 'destructive' : 'outline'} className="capitalize">
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  return (
    <div className={`container mx-auto px-4 py-8 ${maxWidthClass}`}>
      <div className="mb-4">
        <BackLink fallbackHref="/admin/users" label="Back to users" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-foreground">{displayName}</h1>
          <p className="text-muted-foreground text-sm mt-1">{u.email}</p>
          <code className="text-xs text-muted-foreground block mt-2 break-all" title="User id">
            {u.id}
          </code>
        </div>
        <Badge variant="outline" className="capitalize">
          {u.role}
        </Badge>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Created:</span>{' '}
            {formatEST(new Date(u.created_at), 'MMM d, yyyy h:mm a')}
          </p>
          <p>
            <span className="font-medium text-foreground">Last login:</span>{' '}
            {u.last_login_at ? formatEST(new Date(u.last_login_at), 'MMM d, yyyy h:mm a') : '—'}
          </p>
          <p>
            <span className="font-medium text-foreground">Status:</span>{' '}
            {u.archived_at ? `Archived (${formatEST(new Date(u.archived_at), 'MMM d, yyyy')})` : 'Active'}
          </p>
          {u.role === 'parent' && (
            <>
              <p>
                <span className="font-medium text-foreground">Cell:</span> {u.phone?.trim() ? u.phone : '—'}
              </p>
              <p>
                <span className="font-medium text-foreground">ZIP:</span> {u.zip_code?.trim() ? u.zip_code : '—'}
              </p>
              <p>
                <span className="font-medium text-foreground">Wallet credit:</span>{' '}
                <span className="tabular-nums">${parentWalletCredit.toFixed(2)}</span>
              </p>
              <p>
                <span className="font-medium text-foreground">Open bookings (upcoming):</span>{' '}
                {upcomingParentBookings.length}
              </p>
              <p>
                <span className="font-medium text-foreground">Coach reviews submitted:</span> {reviewCount ?? 0}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href="/admin/rewards">Admin rewards / credits</Link>
              </Button>
            </>
          )}
          {u.role === 'coach' && coachAthlete && (
            <>
              <p>
                <span className="font-medium text-foreground">School / club:</span> {coachAthlete.school || '—'}
              </p>
              <p>
                <span className="font-medium text-foreground">Browse:</span>{' '}
                {coachAthlete.active ? 'Visible' : 'Hidden'}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href={`/athlete/${u.id}`}>Open coach public profile</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {u.role === 'parent' && kidsSection && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Wrestlers (kids)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <AdminCreateYouthWrestlerForm
              parentId={u.id}
              parentLabel={displayName}
              defaultZip={u.zip_code}
              defaultPhone={u.phone}
            />
            {kidsSection.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No youth wrestler profiles linked to this parent.</p>
            ) : (
              <ul className="space-y-2">
                {kidsSection.rows.map((k) => {
                  const nm = [k.first_name, k.last_name].filter(Boolean).join(' ').trim() || '—';
                  const status = k.active === false ? 'Inactive' : 'Active';
                  return (
                    <li
                      key={k.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                    >
                      <div>
                        <span className="font-medium text-foreground">{nm}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({k.linkRelation === 'primary' ? 'Primary' : 'Linked'} · {status})
                        </span>
                      </div>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/wrestlers/${k.id}`}>View wrestler</Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {u.role === 'youth_wrestler' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Parents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!parentsSection || parentsSection.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No parent accounts linked (self-managed youth account or missing links).
              </p>
            ) : (
              <ul className="space-y-2">
                {parentsSection.map((p) => (
                  <li
                    key={`${p.id}-${p.relation}`}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                  >
                    <div>
                      <span className="text-sm text-muted-foreground">{p.relation}</span>
                      <p className="font-medium">
                        <Link href={`/admin/users/${p.id}`} className="text-accent hover:underline">
                          {p.email}
                        </Link>
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/users/${p.id}`}>Admin profile</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/wrestlers/${u.id}`}>Open wrestler profile (app)</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {u.role === 'parent' && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Upcoming bookings</CardTitle>
              <p className="text-sm text-muted-foreground">
                Scheduled sessions in the future where this parent booked the session or one of their wrestlers is on the
                roster.
              </p>
            </CardHeader>
            <CardContent>
              {upcomingParentBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming sessions.</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">When</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Coach</th>
                        <th className="py-2 pr-3 font-medium">Facility</th>
                        <th className="py-2 pr-3 font-medium">Wrestler(s)</th>
                        <th className="py-2 pr-3 font-medium text-right">Paid</th>
                        <th className="py-2 pr-3 font-medium">Booker</th>
                        <th className="py-2 pl-3 font-medium text-right">Admin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/80">
                      {upcomingParentBookings.map((b) => {
                        const typeDisp = getSessionTypeDisplay(b.session_type, b.session_mode);
                        return (
                          <tr key={b.id} className="align-top">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <div className="font-medium text-foreground">
                                {formatEST(new Date(b.scheduled_datetime), 'EEE MMM d, yyyy')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatEST(new Date(b.scheduled_datetime), 'h:mm a')}
                              </div>
                            </td>
                            <td className="py-2 pr-3">
                              <span className={typeDisp.className}>{typeDisp.label}</span>
                            </td>
                            <td className="py-2 pr-3">{sessionStatusBadge(b.status)}</td>
                            <td className="py-2 pr-3">
                              {b.coachId ? (
                                <Link href={`/athlete/${b.coachId}`} className="text-accent hover:underline font-medium">
                                  {b.coachName}
                                </Link>
                              ) : (
                                b.coachName
                              )}
                            </td>
                            <td className="py-2 pr-3 max-w-[10rem]">{b.facilityName}</td>
                            <td className="py-2 pr-3 max-w-[10rem] text-muted-foreground">{b.wrestlerSummary}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">${b.familyAmountPaid.toFixed(2)}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">
                              {b.isSessionBooker ? 'This parent' : 'Roster'}
                            </td>
                            <td className="py-2 pl-3 text-right">
                              <Button asChild variant="outline" size="sm" className="h-8">
                                <Link href={`/admin/sessions/${b.id}/edit`}>Edit</Link>
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Booking history</CardTitle>
              <p className="text-sm text-muted-foreground">
                Past dates, completed, cancelled, and no-show sessions tied to this parent or their wrestlers.
              </p>
            </CardHeader>
            <CardContent>
              {historyParentBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No past sessions in history.</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">When</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Coach</th>
                        <th className="py-2 pr-3 font-medium">Facility</th>
                        <th className="py-2 pr-3 font-medium">Wrestler(s)</th>
                        <th className="py-2 pr-3 font-medium text-right">Paid</th>
                        <th className="py-2 pr-3 font-medium">Booker</th>
                        <th className="py-2 pl-3 font-medium text-right">Admin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/80">
                      {historyParentBookings.map((b) => {
                        const typeDisp = getSessionTypeDisplay(b.session_type, b.session_mode);
                        return (
                          <tr key={b.id} className="align-top">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <div className="font-medium text-foreground">
                                {formatEST(new Date(b.scheduled_datetime), 'EEE MMM d, yyyy')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatEST(new Date(b.scheduled_datetime), 'h:mm a')}
                              </div>
                            </td>
                            <td className="py-2 pr-3">
                              <span className={typeDisp.className}>{typeDisp.label}</span>
                            </td>
                            <td className="py-2 pr-3">{sessionStatusBadge(b.status)}</td>
                            <td className="py-2 pr-3">
                              {b.coachId ? (
                                <Link href={`/athlete/${b.coachId}`} className="text-accent hover:underline font-medium">
                                  {b.coachName}
                                </Link>
                              ) : (
                                b.coachName
                              )}
                            </td>
                            <td className="py-2 pr-3 max-w-[10rem]">{b.facilityName}</td>
                            <td className="py-2 pr-3 max-w-[10rem] text-muted-foreground">{b.wrestlerSummary}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">${b.familyAmountPaid.toFixed(2)}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">
                              {b.isSessionBooker ? 'This parent' : 'Roster'}
                            </td>
                            <td className="py-2 pl-3 text-right">
                              <Button asChild variant="outline" size="sm" className="h-8">
                                <Link href={`/admin/sessions/${b.id}/edit`}>Edit</Link>
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
