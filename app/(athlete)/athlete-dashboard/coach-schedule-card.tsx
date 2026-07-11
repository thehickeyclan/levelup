'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, List, LayoutGrid, CalendarDays, MessageCircle } from 'lucide-react';
import { UpcomingSessionActions } from './upcoming-session-actions';
import { startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { formatEST } from '@/lib/format-date';
import { athletePaymentForCoachEstimate, coachPayoutUsd } from '@/lib/coach-session-payout';
import {
  coachPayoutDisplayStatus,
  coachPayoutStatusLabel,
  participantAmountPaidSum,
} from '@/lib/coach-payout-status';

export type CoachSession = {
  id: string;
  scheduled_datetime: string;
  total_price?: number;
  athlete_payment?: number | null;
  price_per_participant?: number | null;
  session_type?: string;
  session_mode?: string;
  focus_area?: string | null;
  focus_area_2?: string | null;
  partner_invite_code?: string | null;
  join_policy?: string | null;
  status: string;
  current_participants?: number;
  max_participants?: number;
  /** Snapshot used with guild default for payout estimates */
  session_payout_rate?: number | null;
  athlete_payout_date?: string | null;
  athlete_paid?: boolean | null;
  facilities?: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
  duration_minutes?: number | null;
  session_participants?: Array<{
    amount_paid?: number | null;
    youth_wrestler_id?: string | null;
    roster_first_name?: string | null;
    roster_last_name?: string | null;
    youth_wrestlers?: { id: string; first_name?: string; last_name?: string } | { id: string; first_name?: string; last_name?: string }[] | null;
  }> | null;
};

function participantPaidSum(s: CoachSession): number {
  const parts = s.session_participants;
  if (!Array.isArray(parts)) return 0;
  return parts.reduce((sum, p) => sum + Number(p.amount_paid ?? 0), 0);
}

function coachPayoutEstimate(s: CoachSession) {
  return coachPayoutUsd({
    athlete_payment: athletePaymentForCoachEstimate(s),
    price_per_participant: s.price_per_participant,
    current_participants: s.current_participants,
    participant_amount_paid_sum: participantPaidSum(s) > 0 ? participantPaidSum(s) : null,
    session_payout_rate: s.session_payout_rate ?? null,
  });
}

function sessionStatusBadge(session: CoachSession) {
  const paidSum = participantAmountPaidSum(session.session_participants);
  const status = coachPayoutDisplayStatus({
    status: session.status,
    athlete_payout_date: session.athlete_payout_date,
    athlete_paid: session.athlete_paid,
    participant_amount_paid_sum: paidSum,
    participants: session.session_participants ?? null,
  });
  const label =
    status === 'not_completed'
      ? session.status === 'cancelled'
        ? 'Cancelled'
        : session.status === 'no-show'
          ? 'No-show'
          : session.status === 'scheduled'
            ? 'Open'
            : session.status
      : coachPayoutStatusLabel(status);
  const variant =
    status === 'paid'
      ? 'default'
      : status === 'payout_pending'
        ? 'outline'
        : session.status === 'cancelled'
          ? 'secondary'
          : 'outline';
  return <Badge variant={variant}>{label}</Badge>;
}

/** Parent-facing total (for refund copy in cancel dialog). total_price when set, else price_per_participant × participants. */
function parentRefundAmount(session: CoachSession): number {
  if (session.total_price != null && Number(session.total_price) > 0) {
    return Number(session.total_price);
  }
  const per = Number(session.price_per_participant ?? 0);
  const n = session.current_participants ?? 0;
  return Math.round(per * n * 100) / 100;
}

/** Small group or partner-open session that is not yet filled (has open slots). */
function isTentative(s: CoachSession): boolean {
  const current = s.current_participants ?? 1;
  const max = s.max_participants ?? 1;
  if (current >= max) return false;
  const isGroup = s.session_type === 'group' || s.session_type === 'small_group';
  const isPartnerOpen = s.session_mode === 'partner-open';
  return isGroup || isPartnerOpen;
}

function facilityName(s: CoachSession): string {
  const f = s.facilities;
  if (!f || typeof f !== 'object') return '—';
  const arr = Array.isArray(f) ? f : [f];
  const first = arr[0] as { name?: string } | null;
  return first?.name ?? '—';
}

function wrestlerNames(s: CoachSession): string[] {
  const parts = s.session_participants ?? [];
  return parts
    .map((p) => {
      const yw = p.youth_wrestlers;
      const o = Array.isArray(yw) ? yw[0] : yw;
      return o && (o.first_name || o.last_name) ? [o.first_name, o.last_name].filter(Boolean).join(' ') : null;
    })
    .filter((n): n is string => Boolean(n));
}

type ViewMode = 'list' | 'table' | 'calendar';

export function CoachScheduleCard({
  upcomingSessions,
  pastSessions,
}: {
  upcomingSessions: CoachSession[];
  pastSessions: CoachSession[];
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [completingSessionId, setCompletingSessionId] = useState<string | null>(null);

  const allSessions = useMemo(
    () => [...upcomingSessions, ...pastSessions].sort(
      (a, b) => new Date(a.scheduled_datetime).getTime() - new Date(b.scheduled_datetime).getTime()
    ),
    [upcomingSessions, pastSessions]
  );

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, CoachSession[]>();
    for (const s of allSessions) {
      const key = formatEST(new Date(s.scheduled_datetime), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [allSessions]);

  const calendarDaysWithTentative = useMemo(() => {
    const tentativeDays = new Set<string>();
    for (const s of allSessions) {
      if (isTentative(s)) {
        tentativeDays.add(formatEST(new Date(s.scheduled_datetime), 'yyyy-MM-dd'));
      }
    }
    return Array.from(tentativeDays).map((d) => new Date(d + 'T12:00:00'));
  }, [allSessions]);

  const calendarDaysConfirmedOnly = useMemo(() => {
    const confirmedDays = new Set<string>();
    for (const [dateKey, sessList] of sessionsByDate) {
      const anyTentative = sessList.some(isTentative);
      if (!anyTentative) confirmedDays.add(dateKey);
    }
    return Array.from(confirmedDays).map((d) => new Date(d + 'T12:00:00'));
  }, [sessionsByDate]);

  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const sessionsInMonth = allSessions.filter(
    (s) => {
      const d = new Date(s.scheduled_datetime);
      return d >= monthStart && d <= monthEnd;
    }
  );

  return (
    <Card className="mb-8">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <CardTitle>Schedule & Bookings</CardTitle>
          <CardDescription>Upcoming and past sessions</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4 mr-1" />
            List
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('table')}
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            Table
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('calendar')}
          >
            <CalendarDays className="h-4 w-4 mr-1" />
            Calendar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {viewMode === 'list' && (
          <>
            <div>
              <h3 className="text-sm font-semibold mb-3">Upcoming</h3>
              {upcomingSessions.length > 0 ? (
                <div className="space-y-3">
                  {upcomingSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">
                          {formatEST(new Date(session.scheduled_datetime), 'EEEE, MMMM d, yyyy')}
                        </p>
                        <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-1">
                          {formatEST(new Date(session.scheduled_datetime), 'h:mm a')}
                          {' • '}
                          {facilityName(session)}
                          {(session.current_participants ?? 0) > 0 && (
                            <>
                              <span> • </span>
                              <span>{session.current_participants} {session.current_participants === 1 ? 'kid' : 'kids'}{wrestlerNames(session).length > 0 ? `: ${wrestlerNames(session).join(', ')}` : ''}</span>
                            </>
                          )}
                          {isTentative(session) && (
                            <>
                              <span> • </span>
                              <Badge variant="outline" className="text-xs border-amber-500/60 text-amber-700 dark:text-amber-400 bg-amber-500/15">Tentative</Badge>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <p className="font-medium">You make ${coachPayoutEstimate(session).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{session.session_type || '—'}</p>
                        <UpcomingSessionActions
                          sessionId={session.id}
                          scheduledDatetime={session.scheduled_datetime}
                          totalPrice={parentRefundAmount(session)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border rounded-lg bg-muted/30">
                  <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No upcoming sessions</p>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Past</h3>
              {pastSessions.length > 0 ? (
                <div className="space-y-3">
                  {pastSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-muted/20"
                    >
                      <div>
                        <p className="font-medium">
                          {formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d, yyyy')}
                        </p>
                        <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-1">
                          {formatEST(new Date(session.scheduled_datetime), 'h:mm a')}
                          {' • '}
                          {facilityName(session)}
                          {(session.current_participants ?? 0) > 0 && (
                            <>
                              <span> • </span>
                              <span>{session.current_participants} {session.current_participants === 1 ? 'kid' : 'kids'}{wrestlerNames(session).length > 0 ? `: ${wrestlerNames(session).join(', ')}` : ''}</span>
                            </>
                          )}
                          {' • '}
                          {sessionStatusBadge(session)}
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <p className="font-medium">You made ${coachPayoutEstimate(session).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{session.session_type || '—'}</p>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {session.status === 'scheduled' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={completingSessionId === session.id}
                              onClick={async () => {
                                setCompletingSessionId(session.id);
                                try {
                                  const res = await fetch(`/api/sessions/${session.id}/complete`, { method: 'POST' });
                                  if (res.ok) router.refresh();
                                } finally {
                                  setCompletingSessionId(null);
                                }
                              }}
                            >
                              {completingSessionId === session.id ? 'Marking…' : 'Mark complete'}
                            </Button>
                          )}
                          <Link href={`/messages/${session.id}`}>
                            <Button variant="ghost" size="sm">
                              <MessageCircle className="h-4 w-4 mr-1" />
                              Message
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No past sessions yet.</p>
              )}
            </div>
          </>
        )}

        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Time</th>
                  <th className="text-left py-2 px-2">Youth wrestler(s)</th>
                  <th className="text-left py-2 px-2">Facility</th>
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-right py-2 px-2">You make</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-right py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allSessions.map((session) => {
                  const isUpcoming = session.status === 'scheduled' && new Date(session.scheduled_datetime) > new Date();
                  return (
                    <tr key={session.id} className="border-b last:border-0">
                      <td className="py-2 px-2">{formatEST(new Date(session.scheduled_datetime), 'MMM d, yyyy')}</td>
                      <td className="py-2 px-2">{formatEST(new Date(session.scheduled_datetime), 'h:mm a')}</td>
                      <td className="py-2 px-2">{wrestlerNames(session).length > 0 ? wrestlerNames(session).join(', ') : '—'}</td>
                      <td className="py-2 px-2">{facilityName(session)}</td>
                      <td className="py-2 px-2">{session.session_type || '—'}</td>
                      <td className="py-2 px-2 text-right">${coachPayoutEstimate(session).toFixed(2)}</td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1 items-center">
                          {isTentative(session) && (
                            <Badge variant="outline" className="text-xs border-amber-500/60 text-amber-700 dark:text-amber-400 bg-amber-500/15">Tentative</Badge>
                          )}
                          {sessionStatusBadge(session)}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        {isUpcoming ? (
                          <UpcomingSessionActions
                            sessionId={session.id}
                            scheduledDatetime={session.scheduled_datetime}
                            totalPrice={parentRefundAmount(session)}
                          />
                        ) : (
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {session.status === 'scheduled' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                disabled={completingSessionId === session.id}
                                onClick={async () => {
                                  setCompletingSessionId(session.id);
                                  try {
                                    const res = await fetch(`/api/sessions/${session.id}/complete`, { method: 'POST' });
                                    if (res.ok) router.refresh();
                                  } finally {
                                    setCompletingSessionId(null);
                                  }
                                }}
                              >
                                {completingSessionId === session.id ? 'Marking…' : 'Mark complete'}
                              </Button>
                            )}
                            <Link href={`/messages/${session.id}`}>
                              <Button variant="ghost" size="sm" className="h-8 text-xs">Message</Button>
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {allSessions.length === 0 && (
              <p className="text-center py-8 text-muted-foreground">No sessions.</p>
            )}
          </div>
        )}

        {viewMode === 'calendar' && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex flex-col items-center shrink-0 w-fit">
              <div className="flex items-center gap-2 mb-2">
                <Button variant="outline" size="icon" onClick={() => setCalendarMonth((m) => subMonths(m, 1))}>←</Button>
                <span className="font-medium min-w-[140px] text-center">{formatEST(calendarMonth, 'MMMM yyyy')}</span>
                <Button variant="outline" size="icon" onClick={() => setCalendarMonth((m) => addMonths(m, 1))}>→</Button>
              </div>
              <Calendar
                mode="single"
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selected={undefined}
                modifiers={{
                  tentative: calendarDaysWithTentative,
                  confirmed: calendarDaysConfirmedOnly,
                }}
                modifiersClassNames={{
                  tentative: 'bg-amber-500/25 font-semibold ring-1 ring-amber-500/40',
                  confirmed: 'bg-accent/20 font-semibold',
                }}
                className="rounded-md border w-fit"
              />
            </div>
            <div className="min-w-0 flex-1 lg:min-w-[260px] lg:max-w-[360px]">
              <h3 className="text-sm font-semibold mb-2 break-words">Sessions in {formatEST(calendarMonth, 'MMMM yyyy')}</h3>
              {sessionsInMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground break-words">No sessions this month.</p>
              ) : (
                <ul className="space-y-2">
                  {sessionsInMonth.map((session) => (
                    <li key={session.id} className={`flex items-center justify-between gap-3 p-3 border rounded-lg ${isTentative(session) ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm break-words flex items-center gap-2">
                          {formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d')} at {formatEST(new Date(session.scheduled_datetime), 'h:mm a')}
                          {isTentative(session) && (
                            <Badge variant="outline" className="text-xs border-amber-500/60 text-amber-700 dark:text-amber-400 bg-amber-500/15 shrink-0">Tentative</Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground break-words">
                          {facilityName(session)}
                          {(session.current_participants ?? 0) > 0 && ` • ${session.current_participants} ${session.current_participants === 1 ? 'kid' : 'kids'}${wrestlerNames(session).length > 0 ? `: ${wrestlerNames(session).join(', ')}` : ''}`}
                          {' • You make $'}{coachPayoutEstimate(session).toFixed(2)}
                        </p>
                      </div>
                      {session.status === 'scheduled' && new Date(session.scheduled_datetime) > new Date() ? (
                        <div className="flex gap-1">
                          <Link href={`/sessions/${session.id}/reschedule`}>
                            <Button variant="outline" size="sm">Reschedule</Button>
                          </Link>
                          <UpcomingSessionActions
                            sessionId={session.id}
                            scheduledDatetime={session.scheduled_datetime}
                            totalPrice={parentRefundAmount(session)}
                          />
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {session.status === 'scheduled' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={completingSessionId === session.id}
                              onClick={async () => {
                                setCompletingSessionId(session.id);
                                try {
                                  const res = await fetch(`/api/sessions/${session.id}/complete`, { method: 'POST' });
                                  if (res.ok) router.refresh();
                                } finally {
                                  setCompletingSessionId(null);
                                }
                              }}
                            >
                              {completingSessionId === session.id ? 'Marking…' : 'Mark complete'}
                            </Button>
                          )}
                          <Link href={`/messages/${session.id}`}>
                            <Button variant="ghost" size="sm">Message</Button>
                          </Link>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
