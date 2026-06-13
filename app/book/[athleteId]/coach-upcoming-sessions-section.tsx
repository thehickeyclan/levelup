import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SessionTypeBadge } from '@/components/session-type-badge';
import { formatEST } from '@/lib/format-date';
import { getEffectiveFilledCount } from '@/lib/sessions';
import { MapPin, Users, ChevronRight, Lock } from 'lucide-react';

export type CoachSessionForBookList = {
  id: string;
  scheduled_datetime: string;
  session_type?: string | null;
  session_mode?: string | null;
  join_policy?: string | null;
  focus_area?: string | null;
  current_participants?: number | null;
  max_participants?: number | null;
  price_per_participant?: number | null;
  partner_invite_code?: string | null;
  facilities?: { name?: string } | { name?: string }[] | null;
  session_participants?: unknown[] | null;
};

function policyBadge(joinPolicy: string | null | undefined) {
  const p = joinPolicy ?? 'public';
  if (p === 'invite_only') {
    return (
      <Badge variant="secondary" className="text-xs">
        Invite
      </Badge>
    );
  }
  if (p === 'private') {
    return (
      <Badge variant="secondary" className="text-xs">
        <Lock className="h-3 w-3 mr-1" />
        Private
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      Public
    </Badge>
  );
}

function sessionCta(
  s: CoachSessionForBookList,
  preselectedWrestlerId: string | null | undefined,
  isFull: boolean
): { href: string | null; label: string } {
  if (isFull) return { href: null, label: 'Full' };
  const policy = s.join_policy ?? 'public';
  const code = s.partner_invite_code?.trim();
  const wrestlerQs =
    preselectedWrestlerId && preselectedWrestlerId.length > 0
      ? `?wrestler=${encodeURIComponent(preselectedWrestlerId)}`
      : '';
  if (policy === 'invite_only' && code) {
    return { href: `/join/${code.toUpperCase()}`, label: 'Join with invite' };
  }
  if (policy === 'public') {
    return { href: `/sessions/${s.id}/register${wrestlerQs}`, label: 'Register' };
  }
  if (policy === 'invite_only' && !code) {
    return { href: null, label: 'Invite link from coach' };
  }
  return { href: `/sessions/${s.id}`, label: 'View session' };
}

export function CoachUpcomingSessionsSection({
  coachFirstName,
  sessions,
  preselectedYouthWrestlerId,
}: {
  coachFirstName: string;
  sessions: CoachSessionForBookList[];
  preselectedYouthWrestlerId?: string | null;
}) {
  if (sessions.length === 0) {
    return (
      <Card className="mb-6 border-dashed border-muted-foreground/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Sessions with {coachFirstName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            No upcoming sessions are on the calendar yet. Scroll to{' '}
            <a href="#schedule-new-session" className="text-accent font-medium underline">
              schedule a new private or partner session
            </a>
            .
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex flex-wrap items-center gap-2">
          Upcoming sessions with {coachFirstName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessions.map((s) => {
          const max = s.max_participants ?? 1;
          const filled = getEffectiveFilledCount({
            current_participants: s.current_participants,
            max_participants: max,
            session_participants: s.session_participants ?? null,
          });
          const openSlots = Math.max(0, max - filled);
          const isFull = openSlots <= 0;
          const dt = new Date(s.scheduled_datetime);
          const fac = Array.isArray(s.facilities) ? s.facilities[0] : s.facilities;
          const price = s.price_per_participant;
          const { href, label } = sessionCta(s, preselectedYouthWrestlerId, isFull);

          return (
            <div
              key={s.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/80"
            >
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <SessionTypeBadge sessionType={s.session_type ?? null} sessionMode={s.session_mode ?? null} />
                  {policyBadge(s.join_policy)}
                  {s.focus_area && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {s.focus_area}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-foreground">
                  {formatEST(dt, 'EEE, MMM d')} · {formatEST(dt, 'h:mm a')}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {fac?.name && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {fac.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3 shrink-0" />
                    {isFull ? 'Full' : `${openSlots} spot${openSlots !== 1 ? 's' : ''} left`}
                  </span>
                  {price != null && Number(price) > 0 && (
                    <span className="text-foreground font-medium">${Number(price)}</span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex sm:flex-col items-stretch gap-2">
                {href ? (
                  <Button size="sm" className="bg-accent text-black hover:bg-[#c4a030] w-full sm:w-auto" asChild>
                    <Link href={href}>
                      {label}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled className="w-full sm:w-auto">
                    {label}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
