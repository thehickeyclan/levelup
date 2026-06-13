'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare, 
  Check, 
  Loader2, 
  UserPlus, 
  Clock, 
  ThumbsUp, 
  Cake,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatEST } from '@/lib/format-date';
import { fillTemplate, getTemplate, type PlaybookActionType } from '@/lib/playbook-templates';
import { daysUntilBirthday } from '@/lib/age-from-dob';
import { cn } from '@/lib/utils';

interface PlaybookData {
  coachFirstName: string;
  newBookings: Array<{
    id: string;
    session_id: string;
    welcomed: boolean;
    youth_wrestlers: { id: string; first_name: string; last_name: string; phone: string | null } | null;
    users: { id: string; first_name: string; last_name: string; phone: string | null } | null;
    sessions: { id: string; scheduled_datetime: string; facilities: { name: string } | null } | null;
  }>;
  preSessionReminders: Array<{
    id: string;
    scheduled_datetime: string;
    reminded: boolean;
    facilities: { name: string } | null;
    session_registrations: Array<{
      id: string;
      youth_wrestlers: { id: string; first_name: string; phone: string | null } | null;
      users: { id: string; first_name: string; phone: string | null } | null;
    }>;
  }>;
  postSessionFollowups: Array<{
    id: string;
    scheduled_datetime: string;
    followedUp: boolean;
    facilities: { name: string } | null;
    session_registrations: Array<{
      id: string;
      youth_wrestlers: { id: string; first_name: string; phone: string | null } | null;
      users: { id: string; first_name: string; phone: string | null } | null;
    }>;
  }>;
  upcomingBirthdays: Array<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    date_of_birth: string;
    wished: boolean;
    parent?: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  }>;
}

interface TextButtonProps {
  phone: string | null;
  message: string;
  onAction: () => void;
  actioned: boolean;
  loading?: boolean;
  /** Parents drive booking — shown first and highlighted. */
  audience?: 'parent' | 'athlete';
}

function TextButton({ phone, message, onAction, actioned, loading, audience = 'athlete' }: TextButtonProps) {
  const [sent, setSent] = useState(actioned);

  if (!phone) {
    return (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {audience === 'parent' ? 'No parent phone' : 'No athlete phone'}
      </span>
    );
  }

  const handleClick = () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const digits = phone.replace(/\D/g, '');
    
    if (isMobile) {
      // Open SMS with pre-filled message
      const encodedMessage = encodeURIComponent(message);
      window.location.href = `sms:${digits}?body=${encodedMessage}`;
    } else {
      // Copy message and open in new context
      navigator.clipboard.writeText(message);
      alert('Message copied! Open your messaging app to send.');
    }
    
    // Record action
    onAction();
    setSent(true);
  };

  if (sent) {
    return (
      <Button variant="ghost" size="sm" disabled className="h-8 text-emerald-500">
        <Check className="h-4 w-4 mr-1" />
        Sent
      </Button>
    );
  }

  const isParent = audience === 'parent';

  return (
    <Button
      variant={isParent ? 'default' : 'outline'}
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className={
        isParent
          ? 'h-8 min-h-[44px] touch-manipulation bg-accent hover:bg-accent-hover text-black border-0'
          : 'h-8 min-h-[44px] touch-manipulation'
      }
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <MessageSquare className="h-4 w-4 mr-1" />
          {isParent ? 'Text parent' : 'Text athlete'}
        </>
      )}
    </Button>
  );
}

export function CoachPlaybook() {
  const [data, setData] = useState<PlaybookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetch('/api/coach/playbook')
      .then(res => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const recordAction = async (
    sessionId: string | null,
    registrationId: string | null,
    contactType: 'athlete' | 'parent',
    contactId: string | null,
    actionType: string
  ) => {
    try {
      await fetch('/api/coach/playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, registrationId, contactType, contactId, actionType }),
      });
    } catch (e) {
      console.error('Failed to record action', e);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const totalItems = 
    data.newBookings.filter(b => !b.welcomed).length +
    data.preSessionReminders.filter(s => !s.reminded).length +
    data.postSessionFollowups.filter(s => !s.followedUp).length +
    data.upcomingBirthdays.filter(b => !b.wished).length;

  if (totalItems === 0) {
    return null; // Hide playbook when all caught up
  }

  const coachName = data.coachFirstName;

  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span>Playbook</span>
            <span className="text-sm font-normal text-muted-foreground">
              ({totalItems} to do)
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-8 w-8 p-0"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 max-w-xl">
          Text <span className="font-medium text-foreground/90">parents</span> first when you can — they usually drive
          scheduling and rebooks.
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* New Bookings - Welcome */}
          {data.newBookings.filter(b => !b.welcomed).length > 0 && (
            <div>
              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                <UserPlus className="h-4 w-4 text-accent" />
                Welcome new bookings
              </h4>
              <div className="space-y-2">
                {data.newBookings.filter(b => !b.welcomed).map(booking => {
                  const athlete = Array.isArray(booking.youth_wrestlers) 
                    ? booking.youth_wrestlers[0] 
                    : booking.youth_wrestlers;
                  const parent = Array.isArray(booking.users) 
                    ? booking.users[0] 
                    : booking.users;
                  const session = Array.isArray(booking.sessions) 
                    ? booking.sessions[0] 
                    : booking.sessions;
                  const facility = session?.facilities;
                  const facilityName = Array.isArray(facility) ? facility[0]?.name : facility?.name;

                  const athleteMsg = fillTemplate(getTemplate('welcome_athlete')?.template || '', {
                    athleteName: athlete?.first_name ?? 'there',
                    coachName,
                    date: session?.scheduled_datetime ? formatEST(new Date(session.scheduled_datetime), 'EEEE, MMM d') : '',
                    time: session?.scheduled_datetime ? formatEST(new Date(session.scheduled_datetime), 'h:mm a') : '',
                    facility: facilityName ?? '',
                  });

                  const parentMsg = fillTemplate(getTemplate('welcome_parent')?.template || '', {
                    parentName: parent?.first_name ?? 'there',
                    athleteName: athlete?.first_name ?? 'your athlete',
                    coachName,
                    date: session?.scheduled_datetime ? formatEST(new Date(session.scheduled_datetime), 'EEEE, MMM d') : '',
                    time: session?.scheduled_datetime ? formatEST(new Date(session.scheduled_datetime), 'h:mm a') : '',
                    facility: facilityName ?? '',
                  });

                  return (
                    <div key={booking.id} className="bg-background rounded-lg p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {athlete?.first_name} {athlete?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session?.scheduled_datetime && formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                        <TextButton
                          audience="parent"
                          phone={parent?.phone ?? null}
                          message={parentMsg}
                          onAction={() => recordAction(booking.session_id, booking.id, 'parent', parent?.id ?? null, 'welcome')}
                          actioned={booking.welcomed}
                        />
                        <TextButton
                          audience="athlete"
                          phone={athlete?.phone ?? null}
                          message={athleteMsg}
                          onAction={() => recordAction(booking.session_id, booking.id, 'athlete', athlete?.id ?? null, 'welcome')}
                          actioned={booking.welcomed}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pre-Session Reminders */}
          {data.preSessionReminders.filter(s => !s.reminded).length > 0 && (
            <div>
              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Remind (session tomorrow)
              </h4>
              <div className="space-y-2">
                {data.preSessionReminders.filter(s => !s.reminded).map(session => {
                  const facility = Array.isArray(session.facilities) ? session.facilities[0] : session.facilities;
                  const regs = session.session_registrations ?? [];
                  const athleteNames = regs.map(r => {
                    const a = Array.isArray(r.youth_wrestlers) ? r.youth_wrestlers[0] : r.youth_wrestlers;
                    return a?.first_name;
                  }).filter(Boolean).join(', ');

                  return (
                    <div key={session.id} className="bg-background rounded-lg p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{athleteNames || 'Session'}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatEST(new Date(session.scheduled_datetime), 'h:mm a')} at {facility?.name ?? 'TBD'}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 items-end shrink-0">
                        {regs.map((reg) => {
                          const athlete = Array.isArray(reg.youth_wrestlers) ? reg.youth_wrestlers[0] : reg.youth_wrestlers;
                          const parent = Array.isArray(reg.users) ? reg.users[0] : reg.users;
                          const athleteMsg = fillTemplate(getTemplate('pre_session_athlete')?.template || '', {
                            athleteName: athlete?.first_name ?? 'there',
                            coachName,
                            time: formatEST(new Date(session.scheduled_datetime), 'h:mm a'),
                            facility: facility?.name ?? '',
                          });
                          const parentMsg = fillTemplate(getTemplate('pre_session_parent')?.template || '', {
                            parentName: parent?.first_name ?? 'there',
                            athleteName: athlete?.first_name ?? 'your athlete',
                            coachName,
                            time: formatEST(new Date(session.scheduled_datetime), 'h:mm a'),
                            facility: facility?.name ?? '',
                          });
                          return (
                            <div key={reg.id} className="flex flex-wrap gap-1 justify-end">
                              <TextButton
                                audience="parent"
                                phone={parent?.phone ?? null}
                                message={parentMsg}
                                onAction={() => recordAction(session.id, reg.id, 'parent', parent?.id ?? null, 'pre_session')}
                                actioned={session.reminded}
                              />
                              <TextButton
                                audience="athlete"
                                phone={athlete?.phone ?? null}
                                message={athleteMsg}
                                onAction={() => recordAction(session.id, reg.id, 'athlete', athlete?.id ?? null, 'pre_session')}
                                actioned={session.reminded}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Post-Session Follow-ups */}
          {data.postSessionFollowups.filter(s => !s.followedUp).length > 0 && (
            <div>
              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                <ThumbsUp className="h-4 w-4 text-emerald-500" />
                Follow up (recently completed)
              </h4>
              <div className="space-y-2">
                {data.postSessionFollowups.filter(s => !s.followedUp).map(session => {
                  const regs = session.session_registrations ?? [];
                  const athleteNames = regs.map(r => {
                    const a = Array.isArray(r.youth_wrestlers) ? r.youth_wrestlers[0] : r.youth_wrestlers;
                    return a?.first_name;
                  }).filter(Boolean).join(', ');

                  return (
                    <div key={session.id} className="bg-background rounded-lg p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{athleteNames || 'Session'}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatEST(new Date(session.scheduled_datetime), 'EEE, MMM d')}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 items-end shrink-0">
                        {regs.map((reg) => {
                          const athlete = Array.isArray(reg.youth_wrestlers) ? reg.youth_wrestlers[0] : reg.youth_wrestlers;
                          const parent = Array.isArray(reg.users) ? reg.users[0] : reg.users;
                          const athleteMsg = fillTemplate(getTemplate('post_session_athlete')?.template || '', {
                            athleteName: athlete?.first_name ?? 'there',
                            coachName,
                          });
                          const parentMsg = fillTemplate(getTemplate('post_session_parent')?.template || '', {
                            parentName: parent?.first_name ?? 'there',
                            athleteName: athlete?.first_name ?? 'your athlete',
                            coachName,
                          });
                          return (
                            <div key={reg.id} className="flex flex-wrap gap-1 justify-end">
                              <TextButton
                                audience="parent"
                                phone={parent?.phone ?? null}
                                message={parentMsg}
                                onAction={() => recordAction(session.id, reg.id, 'parent', parent?.id ?? null, 'post_session')}
                                actioned={session.followedUp}
                              />
                              <TextButton
                                audience="athlete"
                                phone={athlete?.phone ?? null}
                                message={athleteMsg}
                                onAction={() => recordAction(session.id, reg.id, 'athlete', athlete?.id ?? null, 'post_session')}
                                actioned={session.followedUp}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming Birthdays */}
          {data.upcomingBirthdays.filter(b => !b.wished).length > 0 && (
            <div>
              <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                <Cake className="h-4 w-4 text-pink-500" />
                Upcoming birthdays
              </h4>
              <div className="space-y-2">
                {data.upcomingBirthdays.filter(b => !b.wished).map(athlete => {
                  const days = daysUntilBirthday(athlete.date_of_birth);
                  const parent = athlete.parent;
                  const athleteMsg = fillTemplate(getTemplate('birthday')?.template || '', {
                    athleteName: athlete.first_name,
                    coachName,
                  });
                  const parentMsg = fillTemplate(getTemplate('birthday_parent')?.template || '', {
                    parentName: parent?.first_name ?? 'there',
                    athleteName: athlete.first_name,
                    coachName,
                  });

                  return (
                    <div key={athlete.id} className="bg-background rounded-lg p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {athlete.first_name} {athlete.last_name}
                        </p>
                        <p className={cn(
                          'text-xs',
                          days === 0 ? 'text-accent font-medium' : 'text-muted-foreground'
                        )}>
                          {days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `In ${days} days`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                        <TextButton
                          audience="parent"
                          phone={parent?.phone ?? null}
                          message={parentMsg}
                          onAction={() => recordAction(null, null, 'parent', parent?.id ?? null, 'birthday')}
                          actioned={athlete.wished}
                        />
                        <TextButton
                          audience="athlete"
                          phone={athlete.phone}
                          message={athleteMsg}
                          onAction={() => recordAction(null, null, 'athlete', athlete.id, 'birthday')}
                          actioned={athlete.wished}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
