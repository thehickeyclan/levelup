'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import type { SessionRequestRow } from './page';

function namePart(
  o: { first_name?: string; last_name?: string } | null | undefined,
  arr?: boolean
): string {
  if (!o) return '';
  const x = Array.isArray(o) ? o[0] : o;
  return [x?.first_name, x?.last_name].filter(Boolean).join(' ').trim();
}

function facName(f: SessionRequestRow['facilities']): string {
  if (!f) return '';
  const x = Array.isArray(f) ? f[0] : f;
  return x?.name?.trim() || '';
}

export function SessionRequestsClient({ initialRows }: { initialRows: SessionRequestRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [counterActionId, setCounterActionId] = useState<string | null>(null);

  const respondCounter = async (id: string, action: 'accept_counter' | 'decline_counter') => {
    if (action === 'decline_counter' && !window.confirm('Decline this proposed time?')) return;
    setCounterActionId(id);
    try {
      const res = await fetch(`/api/parent-session-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (action === 'accept_counter' && data.sessionId) {
        window.location.href = '/cart/checkout';
        return;
      }
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: action === 'accept_counter' ? 'approved' : 'declined' } : r))
      );
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setCounterActionId(null);
    }
  };

  const cancel = async (id: string) => {
    if (!window.confirm('Cancel this request?')) return;
    setCancellingId(id);
    try {
      const res = await fetch(`/api/parent-session-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)));
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setCancellingId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm space-y-3">
          <p>No session requests here.</p>
          <p>
            Book from each coach&apos;s published openings on their profile or the booking flow—outside times aren&apos;t
            requested through the app anymore.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/training">Training</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const coach = namePart(
          Array.isArray(r.athletes) ? r.athletes[0] : r.athletes,
        );
        const kid = namePart(Array.isArray(r.youth_wrestlers) ? r.youth_wrestlers[0] : r.youth_wrestlers);
        const when = r.preferred_datetime
          ? formatEST(new Date(r.preferred_datetime), 'EEE, MMM d · h:mm a')
          : null;
        const dur = r.duration_minutes ?? 60;
        const pending = r.status === 'pending';
        const counterWhen = r.counter_preferred_datetime
          ? formatEST(new Date(r.counter_preferred_datetime), 'EEE, MMM d · h:mm a')
          : null;

        const badgeClass =
          r.status === 'pending'
            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
            : r.status === 'countered'
              ? 'bg-accent/20 text-amber-800 dark:text-amber-200'
              : r.status === 'approved'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : r.status === 'declined' || r.status === 'expired'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-muted text-muted-foreground';

        return (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{coach || 'Coach'}</p>
                  <p className="text-sm text-muted-foreground">
                    {kid}
                    {when ? ` · ${when}` : ''}
                    {when ? ` · ${dur} min` : ''}
                  </p>
                </div>
                <span className={`text-xs font-medium uppercase px-2 py-0.5 rounded ${badgeClass}`}>
                  {r.status === 'countered' ? 'Action needed' : r.status}
                </span>
              </div>
              {r.status === 'countered' && counterWhen && (
                <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm space-y-2">
                  <p>
                    <span className="font-medium">{coach || 'Coach'}</span> proposed{' '}
                    <span className="font-medium">{counterWhen}</span>.
                    {r.counter_note ? (
                      <>
                        {' '}
                        <span className="text-muted-foreground">— {r.counter_note}</span>
                      </>
                    ) : null}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[44px]"
                      disabled={counterActionId === r.id}
                      onClick={() => void respondCounter(r.id, 'accept_counter')}
                    >
                      {counterActionId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept time'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[44px]"
                      disabled={counterActionId === r.id}
                      onClick={() => void respondCounter(r.id, 'decline_counter')}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              )}
              {facName(r.facilities) && (
                <p className="text-sm text-muted-foreground">Facility: {facName(r.facilities)}</p>
              )}
              {r.session_type && (
                <p className="text-sm text-muted-foreground">Type: {r.session_type.replace('_', ' ')}</p>
              )}
              {r.message && <p className="text-sm text-foreground">&ldquo;{r.message}&rdquo;</p>}
              {r.flexibility_note && (
                <p className="text-sm text-muted-foreground">Flexible: {r.flexibility_note}</p>
              )}
              {r.coach_response && (
                <p className="text-sm border-l-2 border-accent pl-3 mt-2">
                  <span className="text-muted-foreground">Coach: </span>
                  {r.coach_response}
                </p>
              )}
              {r.status === 'approved' && r.created_session_id && (
                <div className="pt-2 space-y-2">
                  <Button asChild className="min-h-[44px] w-full sm:w-auto">
                    <Link href="/cart/checkout">Complete booking (checkout)</Link>
                  </Button>
                  {r.payment_deadline_at && (
                    <p className="text-xs text-muted-foreground">
                      Please pay by {formatEST(new Date(r.payment_deadline_at), 'MMM d, h:mm a')} Eastern.
                    </p>
                  )}
                </div>
              )}
              {r.responded_at && !pending && (
                <p className="text-xs text-muted-foreground">
                  Updated {formatEST(new Date(r.responded_at), 'MMM d, h:mm a')}
                </p>
              )}
              {pending && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[40px] text-destructive border-destructive/50 hover:bg-destructive/10"
                    onClick={() => cancel(r.id)}
                    disabled={cancellingId === r.id}
                  >
                    {cancellingId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Cancel request'
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
