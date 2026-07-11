'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatEST } from '@/lib/format-date';
import { SchoolLogo } from '@/components/school-logo';
import { ProfileImage } from '@/components/profile-image';
import { CapacityBadge } from '@/components/capacity-badge';

export type SmallGroupSession = {
  id: string;
  scheduled_datetime: string;
  session_type?: string;
  session_mode?: string;
  join_policy?: 'public' | 'private' | 'invite_only';
  focus_area?: string | null;
  focus_area_2?: string | null;
  current_participants?: number;
  max_participants?: number;
  total_price?: number;
  price_per_participant?: number;
  parent_id?: string;
  athlete_id?: string;
  athletes?: { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string } | { id: string; first_name?: string; last_name?: string; school?: string; photo_url?: string }[];
  facilities?: { id: string; name?: string; address?: string } | { id: string; name?: string; address?: string }[];
  session_participants?: Array<{
    youth_wrestlers?: { id: string; first_name?: string; last_name?: string; photo_url?: string } | { id: string; first_name?: string; last_name?: string; photo_url?: string }[];
  }>;
};

export type PartnerSession = SmallGroupSession & {
  price_per_participant?: number;
  session_participants?: Array<{
    youth_wrestlers?: { id?: string; first_name?: string; last_name?: string; age?: number; weight_class?: string; skill_level?: string; photo_url?: string } | { id?: string; first_name?: string; last_name?: string; age?: number; weight_class?: string; skill_level?: string; photo_url?: string }[];
  }>;
};

export function SmallGroupSessionsClient({
  sessions,
  partnerSessions,
  userId,
  isAdmin = false,
  bookingAsAthlete = false,
  selfWrestlerId,
}: {
  sessions: SmallGroupSession[];
  partnerSessions: PartnerSession[];
  userId: string;
  isAdmin?: boolean;
  bookingAsAthlete?: boolean;
  selfWrestlerId?: string;
}) {
  const registerHref = (sessionId: string) => {
    const base = `/sessions/${sessionId}/register`;
    if (bookingAsAthlete && selfWrestlerId) {
      return `${base}?wrestler=${encodeURIComponent(selfWrestlerId)}`;
    }
    return base;
  };

  const isOwner = (s: { parent_id?: string; athlete_id?: string }) =>
    s.parent_id === userId || s.athlete_id === userId;

  const allSessions = useMemo(() => {
    const seen = new Set<string>();
    const list: (SmallGroupSession | PartnerSession)[] = [];
    for (const s of [...sessions, ...partnerSessions]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      list.push(s);
    }
    list.sort((a, b) => a.scheduled_datetime.localeCompare(b.scheduled_datetime));
    return list;
  }, [sessions, partnerSessions]);

  const showSessions = useMemo(
    () =>
      allSessions.filter((s) => {
        const current = s.current_participants ?? 0;
        const max = s.max_participants ?? 0;
        if (current >= max) return false;
        const mine = s.parent_id === userId || s.athlete_id === userId;
        if (mine) return true;
        const policy = (s as SmallGroupSession).join_policy;
        // Only public sessions are discoverable; invite_only/private need the shared link.
        return policy === 'public';
      }),
    [allSessions, userId]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Register for a session</CardTitle>
        <p className="text-sm text-muted-foreground">
          {bookingAsAthlete ? (
            <>
              Find a session below and tap <strong>Register</strong> to join. You&apos;ll pay with your athlete account.
            </>
          ) : (
            <>
              <strong>How do I register my kid for a session?</strong> Find the session below (e.g. Liam&apos;s). Click{' '}
              <strong>Register</strong>. Choose your wrestler (e.g. Gavin). Pay. Done. (If you created the session yourself, click{' '}
              <strong>Add my wrestler</strong> instead — no extra charge.)
            </>
          )}
        </p>
      </CardHeader>
      <CardContent>
        {showSessions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-muted-foreground mb-4">No sessions right now.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/find-training">Find by date</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/browse">Book a coach</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {showSessions.map((s) => {
              const coach = Array.isArray(s.athletes) ? s.athletes[0] : s.athletes;
              const fac = Array.isArray(s.facilities) ? s.facilities[0] : s.facilities;
              const dt = new Date(s.scheduled_datetime);
              const current = s.current_participants ?? 0;
              const max = s.max_participants ?? 0;
              const mine = isOwner(s);
              const policy = (s as SmallGroupSession).join_policy;
              const canRegister = policy === 'public' && !mine;

              const coachName = coach ? `${(coach as { first_name?: string; last_name?: string }).first_name ?? ''} ${(coach as { first_name?: string; last_name?: string }).last_name ?? ''}`.trim() : '—';
              const coachPhoto = (coach as { photo_url?: string })?.photo_url;
              const coachSchool = (coach as { school?: string })?.school;
              const hasRoom = current < max;

              return (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg"
                >
                  <div className="min-w-0 flex-1 flex items-start gap-3">
                    <ProfileImage
                      src={coachPhoto}
                      alt={coachName || 'Coach'}
                      className="w-10 h-10 shrink-0"
                      fallbackIconClassName="h-5 w-5 text-muted-foreground"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {formatEST(dt, 'EEE, MMM d')} at {formatEST(dt, 'h:mm a')}
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        {coach && (coach as { id?: string }).id ? (
                          <Link href={`/athlete/${(coach as { id: string }).id}`} className="hover:underline font-medium text-foreground">
                            {coachName}
                          </Link>
                        ) : (
                          <span>{coachName}</span>
                        )}
                        {coach && (coach as { id?: string }).id && (
                          <Link href={`/athlete/${(coach as { id: string }).id}`} className="text-xs text-accent hover:underline">
                            Profile
                          </Link>
                        )}
                        {coachSchool && (
                          <>
                            <SchoolLogo school={coachSchool} size="sm" />
                            <span className="text-muted-foreground">({coachSchool})</span>
                          </>
                        )}
                        {(fac as { name?: string })?.name && <span> · {(fac as { name?: string }).name}</span>}
                      </p>
                      {((s as SmallGroupSession).focus_area || (s as SmallGroupSession).focus_area_2) && (
                        <p className="text-xs text-muted-foreground">
                          Covering: {[(s as SmallGroupSession).focus_area, (s as SmallGroupSession).focus_area_2].filter(Boolean).join(', ')}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <CapacityBadge current={current} max={max} label="spots" />
                        {s.price_per_participant != null && s.price_per_participant > 0 && (
                          <> · ${Number(s.price_per_participant).toFixed(0)}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canRegister && (
                      <Button asChild size="sm" className="bg-accent text-black hover:bg-accent-hover">
                        <Link href={registerHref(s.id)}>Register</Link>
                      </Button>
                    )}
                    {mine && (
                      <Button asChild size="sm" className="bg-accent text-black hover:bg-accent-hover">
                        <Link href={registerHref(s.id)}>Add my wrestler</Link>
                      </Button>
                    )}
                    {!canRegister && !mine && policy === 'invite_only' && (
                      <span className="text-xs text-muted-foreground">Need the link</span>
                    )}
                    {isAdmin && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/sessions/${s.id}/edit`}>Edit</Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
